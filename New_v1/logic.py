from __future__ import annotations
# ─────────── ייצוא כל הפונקציות והקבועים הדרושים ל-main.py ───────────

__all__ = [
    # פונקציות עיבוד קבצים
    'load_excel_flexible',
    'load_mobile_contacts',
    'load_excel',
    
    # פונקציות התאמות
    'top_matches',
    'full_score',
    'process_matching_results',
    'compute_best_scores',
    'extract_relevant_guest_details',
    'extract_smart_fields',
    
    # פונקציות בדיקה
    'validate_dataframes',
    'is_user_authorized',
    
    # פונקציות ייצוא
    'to_buf',
    'export_with_original_structure',  # 🔥 חדש
    'create_contacts_template',
    'create_guests_template',
    
    # פונקציות עזר
    'format_phone',
    'normalize',
    'reason_for',
    
    # קבועים
    'NAME_COL',
    'PHONE_COL',
    'COUNT_COL',
    'SIDE_COL',
    'GROUP_COL',
    'AUTO_SCORE',
    'AUTO_SELECT_TH',
    'MIN_SCORE_DISPLAY',
    'MAX_DISPLAYED',
    'FIELD_PRIORITY',
]

import os, re, logging, json
from io import BytesIO
from typing import List, Set, Dict, Optional

import pandas as pd
import unidecode
from rapidfuzz import fuzz, distance

import pickle
import base64
from datetime import datetime
from googleapiclient.discovery import build
from googleapiclient.http import MediaInMemoryUpload

# Google Sheets via ADC (Cloud Run Service Account)
try:
    import google.auth
    import gspread
    GOOGLE_AVAILABLE = True
except ImportError:
    GOOGLE_AVAILABLE = False
    logging.warning("Google auth not available - using local files only")
    
DRIVE_PARENT_FOLDER_ID = os.environ.get('DRIVE_PARENT_FOLDER_ID', None)

# ───────── קבועים ─────────
NAME_COL          = "שם מלא"
PHONE_COL         = "מספר פלאפון"
COUNT_COL         = "כמות מוזמנים"
SIDE_COL          = "צד"
GROUP_COL         = "קבוצה"

AUTO_SCORE        = 100
AUTO_SELECT_TH    = 93
MIN_SCORE_DISPLAY = 70
MAX_DISPLAYED     = 3

# 🔥 סדר עדיפות לשדות בפרופיל מוזמן (רק השדות החשובים!)
FIELD_PRIORITY = {
    'צד': ['צד', 'side', 'חתן', 'כלה', 'groom', 'bride'],
    'קבוצה': ['קבוצה', 'group', 'משפחה', 'חברים', 'עבודה', 'family', 'friends', 'work'],
    'כמות מוזמנים': ['כמות', 'quantity', 'מוזמנים', 'אורחים', 'guests', 'כמות מוזמנים']
}

# הרשאות/Scopes לקריאה בלבד
SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets.readonly",
    "https://www.googleapis.com/auth/drive.readonly",
]

# ENV לגיליון המורשים
SPREADSHEET_ID_ENV  = "SPREADSHEET_ID"
WORKSHEET_TITLE_ENV = "WORKSHEET_TITLE"

# גיבוי מקומי
LOCAL_ALLOWED_FILE  = "allowed_users.xlsx"
LOCAL_PHONE_COLS    = ("טלפון", "phone", "מספר", "מספר פלאפון", "פלאפון")

# 🔥 מילות יחס/קשר (ignored לגמרי)
GENERIC_TOKENS: Set[str] = {"של", "ה", "בן", "בת", "משפחת", "אחי", "אחות", "דוד", "דודה"}

# 🔥 סיומות/כינויים שאינם חלק מהשם (נמחקות מהקצה)
SUFFIX_TOKENS: Set[str] = {
    "מילואים", "miluyim", "miloyim", "mil", "נייד", "סלולר", "סלולרי",
    "בית", "עבודה", "עסקי", "אישי", "משרד"
}

# ───────── עזרים בסיסיים ─────────

def save_session_to_drive(gc, phone: str, session_data: dict) -> str:
    """
    שומר את המצב של המשתמש ב-Google Drive
    """
    try:
        # בניית שירות Drive
        drive_service = build('drive', 'v3', credentials=gc.auth)
        
        folder_name = f"sessions_{phone}"
        
        # חיפוש תיקייה קיימת
        if DRIVE_PARENT_FOLDER_ID:
            # חפש בתוך התיקייה הראשית
            query = f"name='{folder_name}' and '{DRIVE_PARENT_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false"
        else:
            # חפש בכל ה-Drive
            query = f"name='{folder_name}' and mimeType='application/vnd.google-apps.folder' and trashed=false"
        
        results = drive_service.files().list(q=query, fields="files(id, name)").execute()
        folders = results.get('files', [])
        
        if folders:
            folder_id = folders[0]['id']
        else:
            # יצירת תיקייה חדשה
            folder_metadata = {
                'name': folder_name,
                'mimeType': 'application/vnd.google-apps.folder'
            }
            # אם יש תיקייה ראשית, הוסף אותה כ-parent
            if DRIVE_PARENT_FOLDER_ID:
                folder_metadata['parents'] = [DRIVE_PARENT_FOLDER_ID]
            
            folder = drive_service.files().create(body=folder_metadata, fields='id').execute()
            folder_id = folder.get('id')
        
        # שמירת הסשן
        session_filename = f"session_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pkl"
        
        # המרה ל-pickle
        pickled_data = pickle.dumps(session_data)
        
        # יצירת קובץ ב-Drive
        file_metadata = {
            'name': session_filename,
            'parents': [folder_id]
        }
        
        media = MediaInMemoryUpload(pickled_data, mimetype='application/octet-stream')
        file = drive_service.files().create(
            body=file_metadata, 
            media_body=media, 
            fields='id'
        ).execute()
        
        logging.info(f"✅ Session saved for {phone}: {file.get('id')}")
        return file.get('id')
        
    except Exception as e:
        logging.error(f"Failed to save session to Drive: {e}")
        return None


def load_session_from_drive(gc, phone: str) -> dict:
    """
    טוען את המצב האחרון של המשתמש מ-Google Drive
    """
    try:
        drive_service = build('drive', 'v3', credentials=gc.auth)
        
        folder_name = f"sessions_{phone}"
        
        # חיפוש התיקייה
        if DRIVE_PARENT_FOLDER_ID:
            query = f"name='{folder_name}' and '{DRIVE_PARENT_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false"
        else:
            query = f"name='{folder_name}' and mimeType='application/vnd.google-apps.folder' and trashed=false"
        
        results = drive_service.files().list(q=query, fields="files(id, name)").execute()
        folders = results.get('files', [])
        
        if not folders:
            return None
            
        folder_id = folders[0]['id']
        
        # חיפוש הקובץ האחרון
        query = f"'{folder_id}' in parents and trashed=false"
        results = drive_service.files().list(
            q=query,
            orderBy='createdTime desc',
            pageSize=1,
            fields="files(id, name, createdTime)"
        ).execute()
        
        files = results.get('files', [])
        if not files:
            return None
            
        # הורדת הקובץ
        file_id = files[0]['id']
        request = drive_service.files().get_media(fileId=file_id)
        content = request.execute()
        
        # פענוח
        session_data = pickle.loads(content)
        logging.info(f"✅ Session loaded for {phone}")
        return session_data
        
    except Exception as e:
        logging.error(f"Failed to load session from Drive: {e}")
        return None


import io, os, json, logging
from datetime import datetime
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload
from google.oauth2 import service_account

def save_files_to_drive(phone: str, guests_file, contacts_file) -> dict:
    """
    שומר את הקבצים המקוריים ב-Drive (Cloud Run Ready)
    """
    try:
        creds_json = os.getenv("GOOGLE_APPLICATION_CREDENTIALS_JSON")
        creds_dict = json.loads(creds_json)
        creds = service_account.Credentials.from_service_account_info(
            creds_dict,
            scopes=["https://www.googleapis.com/auth/drive.file"]
        )

        drive_service = build('drive', 'v3', credentials=creds)
        parent_folder = os.getenv("DRIVE_PARENT_FOLDER_ID")
        folder_name = f"files_{phone}"

        # יצירת תיקייה למשתמש אם לא קיימת
        query = f"name='{folder_name}' and '{parent_folder}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false"
        results = drive_service.files().list(q=query, fields="files(id)").execute()
        folders = results.get('files', [])
        folder_id = folders[0]['id'] if folders else None

        if not folder_id:
            metadata = {
                'name': folder_name,
                'mimeType': 'application/vnd.google-apps.folder',
                'parents': [parent_folder]
            }
            folder = drive_service.files().create(body=metadata, fields='id').execute()
            folder_id = folder.get('id')

        saved_files = {}

        # העלאת קובץ מוזמנים
        if guests_file:
            guests_content = guests_file.file.read()
            media = MediaIoBaseUpload(io.BytesIO(guests_content),
                                      mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                                      resumable=True)
            metadata = {
                'name': f"guests_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx",
                'parents': [folder_id]
            }
            f = drive_service.files().create(body=metadata, media_body=media, fields='id').execute()
            saved_files['guests_id'] = f.get('id')

        # העלאת קובץ אנשי קשר
        if contacts_file and contacts_file != 'mobile_contacts':
            contacts_content = contacts_file.file.read()
            media = MediaIoBaseUpload(io.BytesIO(contacts_content),
                                      mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                                      resumable=True)
            metadata = {
                'name': f"contacts_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx",
                'parents': [folder_id]
            }
            f = drive_service.files().create(body=metadata, media_body=media, fields='id').execute()
            saved_files['contacts_id'] = f.get('id')

        return saved_files

    except Exception as e:
        logging.error(f"❌ Failed to save files to Drive: {e}")
        return {}

    
    
def only_digits(s: str) -> str:
    """מחזיר רק ספרות מהמחרוזת"""
    return re.sub(r"\D+", "", s or "")

_punc_re   = re.compile(r"[\|\\/()\[\]\"'׳״.,\-]+")
_space_re  = re.compile(r"\s+")
_token_re  = re.compile(r"\s+")

def normalize(txt: str | None) -> str:
    """נירמול משופר"""
    if not txt:
        return ""
    t = str(txt).lower()
    t = _punc_re.sub(" ", t)
    t = _space_re.sub(" ", t).strip()
    return unidecode.unidecode(t)

def _clean_token(tok: str) -> str:
    """מסיר ו' חיבור, סיומת i, ומתעלם מ־SUFFIX_TOKENS"""
    if tok in SUFFIX_TOKENS:
        return ""
    if tok.startswith("v") and len(tok) > 2:
        tok = tok[1:]
    if len(tok) >= 4 and tok.endswith("i"):
        tok = tok[:-1]
    return tok

def _tokens(name: str) -> List[str]:
    """מחזיר רשימת טוקנים נקייה"""
    tks = [_clean_token(t) for t in _token_re.split(name)]
    return [t for t in tks if t and t not in GENERIC_TOKENS]

def _fuzzy_eq(a: str, b: str) -> bool:
    """טוקנים זהים או דומים ≥ 90 % ב‑Levenshtein"""
    return a == b or distance.Levenshtein.normalized_similarity(a, b) >= 0.9

def _fuzzy_jaccard(gs: List[str], cs: List[str]) -> float:
    """חישוב Jaccard עם התחשבות ב-fuzzy equality"""
    matched, used = 0, set()
    for g in gs:
        for c in cs:
            if c in used:
                continue
            if _fuzzy_eq(g, c):
                matched += 1
                used.add(c)
                break
    union = len(set(gs)) + len(set(cs)) - matched
    return matched / union if union else 1.0

def format_phone(ph: str) -> str:
    """עיצוב טלפון"""
    d = "".join(filter(str.isdigit, str(ph)))
    if d.startswith("972"):
        d = "0" + d[3:]
    return f"{d[:3]}-{d[3:]}" if len(d) == 10 else d

# ───────── זיהוי אוטומטי של עמודות ─────────
def detect_column_type(col_name: str, sample_data: pd.Series) -> str:
    """זיהוי אוטומטי של סוג העמודה"""
    col_lower = str(col_name).lower().strip()
    sample_str = sample_data.astype(str).str.lower()
    
    # טלפון
    phone_keywords = ['טלפון', 'פלאפון', 'נייד', 'סלולר', 'phone', 'mobile', 'cell', 'מספר']
    has_phone_keyword = any(keyword in col_lower for keyword in phone_keywords)
    has_digits = sample_str.str.contains(r'\d{9,}').any()
    if has_phone_keyword or has_digits:
        return 'phone'
    
    # שם
    name_keywords = ['שם', 'name', 'מוזמן', 'guest', 'אורח']
    has_name_keyword = any(keyword in col_lower for keyword in name_keywords)
    has_hebrew = sample_str.str.contains(r'[א-ת]').any()
    has_english = sample_str.str.contains(r'[a-z]').any()
    if has_name_keyword or has_hebrew or has_english:
        return 'name'
    
    # כמות
    count_keywords = ['כמות', 'מספר', 'count', 'qty', 'quantity', 'אורחים', 'מוזמנים']
    has_count_keyword = any(keyword in col_lower for keyword in count_keywords)
    is_numeric = pd.to_numeric(sample_data, errors='coerce').notna().sum() > len(sample_data) * 0.7
    if has_count_keyword or is_numeric:
        return 'count'
    
    # צד
    side_keywords = ['צד', 'side', 'חתן', 'כלה', 'groom', 'bride']
    if any(keyword in col_lower for keyword in side_keywords):
        return 'side'
    
    # קבוצה
    group_keywords = ['קבוצה', 'group', 'סוג', 'type', 'קטגוריה', 'משפחה', 'חברים', 'עבודה']
    if any(keyword in col_lower for keyword in group_keywords):
        return 'group'
    
    return 'other'

def smart_column_mapping(df: pd.DataFrame) -> Dict[str, str]:
    """מיפוי חכם של עמודות"""
    mapping = {}
    for col in df.columns:
        col_type = detect_column_type(col, df[col].head(10))
        mapping[col] = col_type
    return mapping

def identify_relevant_fields(df: pd.DataFrame) -> Dict[str, str]:
    """זיהוי השדות הרלוונטיים"""
    column_mapping = smart_column_mapping(df)
    relevant_fields = {}
    
    side_cols = [col for col, type_val in column_mapping.items() if type_val == 'side']
    if side_cols:
        relevant_fields['צד'] = side_cols[0]
    
    group_cols = [col for col, type_val in column_mapping.items() if type_val == 'group']
    if group_cols:
        relevant_fields['קבוצה'] = group_cols[0]
    
    count_cols = [col for col, type_val in column_mapping.items() if type_val == 'count']
    if count_cols:
        relevant_fields['כמות'] = count_cols[0]
    
    return relevant_fields

def _resolve_full_name_series(df: pd.DataFrame) -> pd.Series:
    """מאחד שם פרטי+משפחה / מזהה 'שם מלא'"""
    cols = list(df.columns)
    low = {c: str(c).strip().lower() for c in cols}
    
    direct = {"שם מלא", "full name", "fullname", "guest name", "שם המוזמן", "name"}
    for c in cols:
        if low[c] in direct:
            return df[c].fillna("").astype(str).str.strip()
    
    first = [c for c in cols if "פרטי" in low[c] or low[c] in {"שם", "first", "firstname", "given"}]
    last  = [c for c in cols if "משפחה" in low[c] or low[c] in {"last", "lastname", "surname", "family"}]
    
    if first and last:
        f = first[0]
        l = last[0]
        return (df[f].fillna("").astype(str).str.strip() + " " +
                df[l].fillna("").astype(str).str.strip()).str.replace(r"\s+", " ", regex=True).str.strip()
    
    name_like = [c for c in cols if any(k in low[c] for k in ["שם", "name", "guest", "מוזמן"])]
    if name_like:
        best_col = max(name_like, key=lambda col: df[col].astype(str).str.len().mean())
        return df[best_col].fillna("").astype(str).str.strip()
    
    if len(df.columns) > 0:
        return df.iloc[:, 0].fillna("").astype(str).str.strip()
    
    return pd.Series([""] * len(df))

# ───────── טעינת קבצים ─────────
def load_excel_flexible(file) -> pd.DataFrame:
    """טעינת קובץ עם זיהוי אוטומטי"""
    try:
        print(f"📁 Reading file: {getattr(file, 'filename', 'unknown')}")
        
        if hasattr(file, "filename") and str(file.filename).lower().endswith(".csv"):
            df = pd.read_csv(file, encoding='utf-8')
        else:
            df = pd.read_excel(file)
        
        print(f"📊 Shape: {df.shape}")
        print(f"📋 Columns: {list(df.columns)}")
        
        df.columns = [str(col).strip() for col in df.columns]
        df = df.dropna(how='all')
        
        if len(df) == 0:
            raise Exception("הקובץ ריק")
        
        is_contacts_file = (
            len(df.columns) >= 3 and 
            df.iloc[:, 0].astype(str).str.contains(r'972\d{9}').any()
        )
        
        standard_df = pd.DataFrame()
        
        if is_contacts_file:
            print("📞 Contacts file")
            standard_df[PHONE_COL] = df.iloc[:, 0].astype(str).str.strip()
            standard_df[NAME_COL] = df.iloc[:, 2].astype(str).str.strip()
        else:
            print("👰 Guests file")
            column_mapping = smart_column_mapping(df)
            relevant_fields = identify_relevant_fields(df)
            
            standard_df[NAME_COL] = _resolve_full_name_series(df)
            
            phone_cols = [col for col, type_val in column_mapping.items() if type_val == 'phone']
            if phone_cols:
                standard_df[PHONE_COL] = df[phone_cols[0]].astype(str).str.strip()
            else:
                standard_df[PHONE_COL] = ""
            
            count_cols = [col for col, type_val in column_mapping.items() if type_val == 'count']
            if count_cols:
                counts_raw = df[count_cols[0]].astype(str)
                counts_num = pd.to_numeric(
                    counts_raw.str.extract(r"(\d+)")[0], 
                    errors="coerce"
                )
                standard_df[COUNT_COL] = counts_num.fillna(1).astype(int)
            else:
                standard_df[COUNT_COL] = 1
            
            for display_name, col_name in relevant_fields.items():
                if col_name in df.columns:
                    standard_df[display_name] = df[col_name].astype(str).fillna("")
        
        if COUNT_COL not in standard_df.columns:
            standard_df[COUNT_COL] = 1
        if SIDE_COL not in standard_df.columns:
            standard_df[SIDE_COL] = ""
        if GROUP_COL not in standard_df.columns:
            standard_df[GROUP_COL] = ""
        
        standard_df["norm_name"] = standard_df[NAME_COL].map(normalize)
        standard_df = standard_df[standard_df["norm_name"].str.strip() != ""]
        
        if len(standard_df) == 0:
            raise Exception("לא נמצאו רשומות תקינות")
        
        print(f"✅ Final shape: {standard_df.shape}")
        return standard_df
        
    except Exception as e:
        print(f"❌ Error: {e}")
        raise Exception(f"לא ניתן לקרוא: {str(e)}")

def load_mobile_contacts(contacts_data: List[Dict]) -> pd.DataFrame:
    """טעינת אנשי קשר ממובייל"""
    try:
        print(f"📱 Loading {len(contacts_data)} contacts")
        df = pd.DataFrame(contacts_data)
        
        if 'name' not in df.columns or 'phone' not in df.columns:
            raise Exception("פורמט לא תקין")
        
        standard_df = pd.DataFrame()
        standard_df[NAME_COL] = df['name'].astype(str).str.strip()
        standard_df[PHONE_COL] = df['phone'].astype(str).str.strip()
        standard_df[COUNT_COL] = 1
        standard_df[SIDE_COL] = ""
        standard_df[GROUP_COL] = ""
        standard_df["norm_name"] = standard_df[NAME_COL].map(normalize)
        
        standard_df = standard_df[
            (standard_df["norm_name"].str.strip() != "") & 
            (standard_df[PHONE_COL].str.strip() != "")
        ]
        
        if len(standard_df) == 0:
            raise Exception("לא נמצאו אנשי קשר תקינים")
        
        print(f"✅ Processed: {len(standard_df)}")
        return standard_df
        
    except Exception as e:
        print(f"❌ Error: {e}")
        raise Exception(f"לא ניתן לעבד: {str(e)}")

def load_excel(file) -> pd.DataFrame:
    """Backwards compatibility"""
    return load_excel_flexible(file)

# ───────── אלגוריתם התאמה ─────────
def full_score(g_norm: str, c_norm: str) -> int:
    """ציון התאמה 0–100"""
    if not g_norm or not c_norm:
        return 0
    if g_norm.strip() == c_norm.strip():
        return AUTO_SCORE
        
    g_t, c_t = _tokens(g_norm), _tokens(c_norm)
    
    if g_t == c_t:
        return AUTO_SCORE
    
    if not g_t or not c_t:
        return fuzz.partial_ratio(g_norm, c_norm)
    
    tr = fuzz.token_set_ratio(" ".join(g_t), " ".join(c_t)) / 100
    fr = fuzz.ratio(g_t[0], c_t[0]) / 100
    jr = _fuzzy_jaccard(g_t, c_t)
    
    gap = abs(len(g_t) - len(c_t))
    penalty = (min(len(g_t), len(c_t)) / max(len(g_t), len(c_t))) if gap >= 2 else 1
    
    score = (0.6 * tr + 0.2 * fr + 0.2 * jr) * penalty * 100
    return int(round(score))

def reason_for(g_norm: str, c_norm: str, score: int) -> str:
    """הסבר לציון"""
    overlap = [t for t in _tokens(g_norm) if t in set(_tokens(c_norm))]
    if overlap:
        return f"חפיפה: {', '.join(overlap[:2])}"
    if score >= AUTO_SELECT_TH:
        return "התאמה גבוהה"
    return ""

def top_matches(guest_norm: str, contacts_df: pd.DataFrame, limit_to_three: bool = False) -> pd.DataFrame:
    """בחירת מועמדים"""
    if not guest_norm:
        return pd.DataFrame(columns=list(contacts_df.columns) + ["score", "reason"])

    scores = contacts_df["norm_name"].apply(lambda c: full_score(guest_norm, c))
    df = contacts_df.assign(score=scores)
    max_score = int(df["score"].max())
    
    if limit_to_three and max_score >= AUTO_SELECT_TH:
        candidates = (
            df[df["score"] >= 90]
            .sort_values(["score", NAME_COL], ascending=[False, True])
            .head(3)
            .copy()
        )
    elif max_score == AUTO_SCORE:
        candidates = (
            df[df["score"] >= 90]
            .sort_values(["score", NAME_COL], ascending=[False, True])
            .head(3)
            .copy()
        )
    else:
        candidates = (
            df[df["score"] >= MIN_SCORE_DISPLAY]
            .sort_values(["score", NAME_COL], ascending=[False, True])
            .head(MAX_DISPLAYED)
            .copy()
        )

    if len(candidates) > 0:
        reason_series = candidates.apply(
            lambda row: reason_for(guest_norm, row["norm_name"], row["score"]),
            axis=1
        )
        candidates = candidates.copy()
        candidates["reason"] = reason_series

    return candidates

def extract_smart_fields(guest_details: dict) -> dict:
    """🔥 חילוץ חכם של שדות לפי סדר עדיפות"""
    result = {}
    
    for display_name, keywords in FIELD_PRIORITY.items():
        for key in guest_details.keys():
            key_lower = key.lower()
            if any(kw in key_lower for kw in keywords):
                value = guest_details[key]
                if value and str(value).strip():
                    result[display_name] = str(value).strip()
                break
    
    return result

def extract_relevant_guest_details(row: pd.Series) -> Dict:
    """חילוץ פרטי מוזמן"""
    details = {}
    exclude_cols = {NAME_COL, PHONE_COL, "norm_name", "score", "best_score"}
    
    for col in row.index:
        if col not in exclude_cols and pd.notna(row[col]) and str(row[col]).strip():
            details[col] = str(row[col])
    
    return details

def compute_best_scores(guests_df: pd.DataFrame, contacts_df: pd.DataFrame) -> pd.DataFrame:
    """מחשב ציונים"""
    best_scores = []
    for _, guest_row in guests_df.iterrows():
        matches = top_matches(guest_row["norm_name"], contacts_df)
        best_score = int(matches["score"].max()) if len(matches) > 0 else 0
        best_scores.append(best_score)
    
    guests_df = guests_df.copy()
    guests_df["best_score"] = best_scores
    return guests_df

def process_matching_results(guests_df: pd.DataFrame, contacts_df: pd.DataFrame, contacts_source: str = "file") -> List[Dict]:
    """עיבוד מלא"""
    results = []
    guests_with_scores = compute_best_scores(guests_df, contacts_df)
    
    perfect_matches = []
    auto_matches = []
    good_matches = []
    weak_matches = []
    
    for _, guest_row in guests_with_scores.iterrows():
        guest_name = guest_row[NAME_COL]
        guest_norm = guest_row["norm_name"]
        best_score = guest_row["best_score"]
        
        limit_to_three = best_score >= AUTO_SELECT_TH
        matches = top_matches(guest_norm, contacts_df, limit_to_three=limit_to_three)
        
        phone_map = {}
        for _, match_row in matches.iterrows():
            phone = format_phone(match_row[PHONE_COL])
            score = int(match_row["score"])
            name = match_row[NAME_COL]
            reason = match_row.get("reason", "")
            
            if phone not in phone_map:
                phone_map[phone] = {
                    "names": [name],
                    "phone": phone,
                    "score": score,
                    "reason": reason
                }
            else:
                phone_map[phone]["names"].append(name)
                if score > phone_map[phone]["score"]:
                    phone_map[phone]["score"] = score
                    phone_map[phone]["reason"] = reason
        
        candidates = []
        for phone, data in phone_map.items():
            candidate = {
                "name": " / ".join(data["names"]),
                "phone": phone,
                "score": data["score"],
                "reason": data["reason"]
            }
            candidates.append(candidate)
        
        candidates.sort(key=lambda x: x["score"], reverse=True)
        
        auto_selected = None
        if candidates and candidates[0]["score"] >= AUTO_SELECT_TH:
            auto_selected = candidates[0]
        
        raw_details = extract_relevant_guest_details(guest_row)
        guest_details = extract_smart_fields(raw_details)
        
        result = {
            "guest": guest_name,
            "guest_details": guest_details,
            "candidates": candidates,
            "best_score": best_score,
            "auto_selected": auto_selected
        }
        
        if best_score == 100:
            perfect_matches.append(result)
        elif best_score >= AUTO_SELECT_TH:
            auto_matches.append(result)
        elif best_score >= 70:
            good_matches.append(result)
        else:
            weak_matches.append(result)
    
    sorted_results = perfect_matches[:30] + auto_matches + good_matches + weak_matches
    return sorted_results

def validate_dataframes(guests_df: pd.DataFrame, contacts_df: pd.DataFrame) -> tuple[bool, str]:
    """בדיקת תקינות"""
    if guests_df is None or len(guests_df) == 0:
        return False, "קובץ המוזמנים ריק"
    if NAME_COL not in guests_df.columns:
        return False, f"חסרה עמודה '{NAME_COL}'"
    if "norm_name" not in guests_df.columns:
        return False, "שגיאת עיבוד"
    if contacts_df is None or len(contacts_df) == 0:
        return False, "קובץ אנשי הקשר ריק"
    if NAME_COL not in contacts_df.columns:
        return False, f"חסרה עמודה '{NAME_COL}'"
    if PHONE_COL not in contacts_df.columns:
        return False, f"חסרה עמודה '{PHONE_COL}'"
    if "norm_name" not in contacts_df.columns:
        return False, "שגיאת עיבוד"
    return True, "OK"

# 🔥 בדיקה אם יש עמודת טלפון קיימת
def check_existing_phone_column(file) -> dict:
    """
    🔥 בודק אם יש עמודת טלפון בקובץ
    מחזיר: {
        'has_phone_column': bool,
        'phone_column_name': str or None,
        'filled_count': int,
        'empty_count': int
    }
    """
    try:
        if hasattr(file, "filename") and str(file.filename).lower().endswith(".csv"):
            df = pd.read_csv(file, encoding='utf-8')
        else:
            df = pd.read_excel(file)
        
        df.columns = [str(col).strip() for col in df.columns]
        
        column_mapping = smart_column_mapping(df)
        phone_cols = [col for col, type_val in column_mapping.items() if type_val == 'phone']
        
        if phone_cols:
            phone_col = phone_cols[0]
            phone_data = df[phone_col].fillna('').astype(str)
            filled = (phone_data.str.strip() != '').sum()
            empty = len(phone_data) - filled
            
            return {
                'has_phone_column': True,
                'phone_column_name': phone_col,
                'filled_count': int(filled),
                'empty_count': int(empty),
                'total_rows': len(df)
            }
        else:
            return {
                'has_phone_column': False,
                'phone_column_name': None,
                'filled_count': 0,
                'empty_count': len(df),
                'total_rows': len(df)
            }
            
    except Exception as e:
        print(f"❌ Check phone column error: {e}")
        return {
            'has_phone_column': False,
            'phone_column_name': None,
            'filled_count': 0,
            'empty_count': 0,
            'total_rows': 0
        }

# 🔥 ייצוא חכם - כל הקובץ המקורי
def export_with_original_structure(original_file, selected_contacts: dict, skip_filled: bool = False) -> BytesIO:
    """
    🔥 ייצוא חכם:
    - מוריד את **כל הקובץ המקורי** (לא רק מה שעובד)
    - אם יש עמודת טלפון קיימת → ממלא אותה
    - אם אין → מוסיף עמודה חדשה בסוף
    - skip_filled: אם True, לא ממלא שורות שיש להן כבר מספר
    """
    try:
        # קרא את כל הקובץ המקורי
        if hasattr(original_file, "filename") and str(original_file.filename).lower().endswith(".csv"):
            df = pd.read_csv(original_file, encoding='utf-8')
        else:
            df = pd.read_excel(original_file)
        
        df.columns = [str(col).strip() for col in df.columns]
        
        print(f"📊 Original file has {len(df)} rows")
        
        # זהה עמודת שם
        name_series = _resolve_full_name_series(df)
        
        # חפש עמודת טלפון קיימת
        column_mapping = smart_column_mapping(df)
        phone_cols = [col for col, type_val in column_mapping.items() if type_val == 'phone']
        
        if phone_cols:
            # יש עמודת טלפון - מלא אותה
            phone_col_name = phone_cols[0]
            print(f"📞 Found existing phone column: {phone_col_name}")
        else:
            # אין עמודת טלפון - צור חדשה
            phone_col_name = "מספר פלאפון"
            df[phone_col_name] = ""
            print(f"➕ Created new phone column: {phone_col_name}")
        
        # 🔥 מלא את עמודת הטלפון לכל השורות
        filled_count = 0
        skipped_count = 0
        
        for idx, guest_name in enumerate(name_series):
            # בדוק אם יש כבר מספר בשורה הזו
            current_phone = str(df.at[idx, phone_col_name]).strip()
            has_existing_phone = current_phone and current_phone != '' and current_phone.lower() != 'nan'
            
            # אם skip_filled=True ויש מספר - דלג
            if skip_filled and has_existing_phone:
                skipped_count += 1
                continue
            
            # אם יש התאמה - מלא
            if guest_name in selected_contacts:
                contact = selected_contacts[guest_name]
                if not contact.get('isNotFound'):
                    phone = contact.get('phone', '')
                    if phone:
                        df.at[idx, phone_col_name] = phone
                        filled_count += 1
        
        print(f"✅ Filled {filled_count} phones")
        if skip_filled:
            print(f"⏭️ Skipped {skipped_count} rows (already had phone)")
        
        # ייצא לאקסל
        buf = BytesIO()
        with pd.ExcelWriter(buf, engine="openpyxl") as w:
            df.to_excel(w, index=False, sheet_name="תוצאות")
        buf.seek(0)
        
        print(f"📥 Exported all {len(df)} rows from original file")
        return buf
        
    except Exception as e:
        print(f"❌ Export error: {e}")
        raise Exception(f"שגיאה בייצוא: {str(e)}")

def to_buf(df: pd.DataFrame) -> BytesIO:
    """ייצוא רגיל (backwards compatibility)"""
    export = df.drop(
        columns=["norm_name", "score", "best_score"], 
        errors="ignore"
    ).copy()
    
    if PHONE_COL in export.columns:
        cols = [col for col in export.columns if col != PHONE_COL]
        cols.append(PHONE_COL)
        export = export[cols]
    
    buf = BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as w:
        export.to_excel(w, index=False, sheet_name="תוצאות")
    buf.seek(0)
    return buf

def create_contacts_template() -> pd.DataFrame:
    """קובץ דוגמה לאנשי קשר"""
    template = pd.DataFrame({
        'מספר נייד': [
            '972507676706',
            '972503377313',
            '972545221212',
            '972508688680'
        ],
        'שם': [
            'ניר',
            'כריסטינה',
            'צ',
            'אמיר'
        ],
        'שם מלא': [
            'ניר לוי',
            'כריסטינה הץ',
            'צ מאי מדאאיבת ביסלה',
            'אמיר מרדכי קוקטלים'
        ]
    })
    return template

def create_guests_template() -> pd.DataFrame:
    """קובץ דוגמה למוזמנים"""
    template = pd.DataFrame({
        'שם מלא': [
            'ישראל כהן',
            'שרה לוי', 
            'דוד אברהם',
            'רחל גולד'
        ],
        'כמות מוזמנים': [2, 1, 3, 2],
        'צד': ['חתן', 'כלה', 'חתן', 'כלה'],
        'קבוצה': ['משפחה', 'חברות', 'עבודה', 'משפחה']
    })
    return template

# ───────── הרשאות ─────────
def _pick_worksheet(sh):
    """מאתר לשונית לפי שם"""
    wanted = os.getenv(WORKSHEET_TITLE_ENV)
    if wanted:
        w = wanted.strip().lower()
        for ws in sh.worksheets():
            if (ws.title or "").strip().lower() == w:
                return ws
    return sh.get_worksheet(0)

def _find_phone_col(header: list[str]) -> int:
    """אינדקס עמודת הטלפון"""
    header_lower = [str(h).strip().lower() for h in header]
    lookup = tuple(x.lower() for x in ("טלפון", "מספר פלאפון", "פלאפון", "phone", "מספר"))
    for i, h in enumerate(header_lower):
        if h in lookup:
            return i
    return 1

def _load_allowed_from_sheets() -> set[str] | None:
    """טוען טלפונים מורשים מ-Sheets"""
    if not GOOGLE_AVAILABLE:
        logging.info("Google Sheets not available")
        return None
        
    sheet_id = os.getenv(SPREADSHEET_ID_ENV)
    if not sheet_id:
        return None
    try:
        creds, _ = google.auth.default(scopes=SCOPES)
        gc = gspread.authorize(creds)
        sh = gc.open_by_key(sheet_id)
        ws = _pick_worksheet(sh)

        rows = ws.get_all_values() or []
        if len(rows) < 2:
            logging.info("Allowed sheet is empty")
            return set()

        header = [str(c).strip() for c in rows[0]]
        phone_idx = _find_phone_col(header)

        allowed = {
            only_digits(r[phone_idx])
            for r in rows[1:]
            if len(r) > phone_idx and only_digits(r[phone_idx])
        }

        if allowed:
            logging.info(f"Loaded {len(allowed)} allowed phones from Sheets")
        return allowed
    except Exception:
        logging.exception("Failed to load from Sheets")
        return None

def _load_allowed_from_excel() -> set[str]:
    """גיבוי: טוען מקובץ מקומי"""
    if not os.path.exists(LOCAL_ALLOWED_FILE):
        return set()
    try:
        df = pd.read_excel(LOCAL_ALLOWED_FILE, dtype=str)
    except Exception:
        logging.exception("Failed to read local Excel")
        return set()

    cols = [c for c in df.columns if any(k in str(c).lower() for k in LOCAL_PHONE_COLS)]
    if not cols:
        return set()

    phone_col = cols[0]
    allowed = {only_digits(str(v)) for v in df[phone_col] if only_digits(str(v))}
    logging.info(f"Loaded {len(allowed)} from local Excel")
    return allowed

def is_user_authorized(phone: str) -> bool:
    """בדיקת הרשאה"""
    clean = only_digits(phone)
    allowed = _load_allowed_from_sheets()
    if allowed is None:
        allowed = _load_allowed_from_excel()
    return clean in allowed