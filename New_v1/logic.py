# logic.py – מערכת התאמת מוזמנים מתקדמת (מעודכן)
"""שדרוג אלגוריתם התאמת השמות עם תמיכה במובייל ופיצ'רים חדשים
----------------------------------------------------------------
* זיהוי אוטומטי וגמיש של עמודות
* תמיכה בפורמטים שונים של קבצי Excel/CSV
* תמיכה באנשי קשר ממובייל
* אלגוריתם התאמה מתקדם עם fuzzy matching
* נורמליזציה משופרת של שמות
* מערכת הרשאות עם Google Sheets וגיבוי מקומי
* טיפול בשגיאות encoding ופורמטים שונים
* תמיכה בשדות דינמיים במוזמנים
* זיהוי חכם של שדות רלוונטיים
"""

from __future__ import annotations

import os, re, logging, json
from io import BytesIO
from typing import List, Set, Dict, Optional

import pandas as pd
import unidecode
from rapidfuzz import fuzz, distance

# Google Sheets via ADC (Cloud Run Service Account)
try:
    import google.auth
    import gspread
    GOOGLE_AVAILABLE = True
except ImportError:
    GOOGLE_AVAILABLE = False
    logging.warning("Google auth not available - using local files only")

# ───────── קבועים ─────────
NAME_COL          = "שם מלא"
PHONE_COL         = "מספר פלאפון"
COUNT_COL         = "כמות מוזמנים"
SIDE_COL          = "צד"
GROUP_COL         = "קבוצה"

AUTO_SCORE        = 100
AUTO_SELECT_TH    = 93
MIN_SCORE_DISPLAY = 70
MAX_DISPLAYED     = 6

# הרשאות/Scopes לקריאה בלבד
SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets.readonly",
    "https://www.googleapis.com/auth/drive.readonly",
]

# ENV לגיליון המורשים
SPREADSHEET_ID_ENV  = "SPREADSHEET_ID"
WORKSHEET_TITLE_ENV = "WORKSHEET_TITLE"   # אופציונלי

# גיבוי מקומי
LOCAL_ALLOWED_FILE  = "allowed_users.xlsx"
LOCAL_PHONE_COLS    = ("טלפון", "phone", "מספר", "מספר פלאפון", "פלאפון")

# מילות יחס/קשר (ignored לגמרי)
GENERIC_TOKENS: Set[str] = {"של", "ה", "בן", "בת", "משפחת", "אחי", "אחות", "דוד", "דודה"}

# סיומות/כינויים שאינם חלק מהשם (נמחקות מהקצה)
SUFFIX_TOKENS: Set[str] = {
    "מילואים", "miluyim", "miloyim", "mil", "נייד", "סלולר", "סלולרי",
    "בית", "עבודה", "עסקי", "אישי", "משרד"
}

# ───────── עזרים בסיסיים ─────────
def only_digits(s: str) -> str:
    """מחזיר רק ספרות מהמחרוזת"""
    return re.sub(r"\D+", "", s or "")

# כל פיסוק + תווי ׀ / () [] יחלפו לרווח (נורמליזציה משופרת)
_punc_re   = re.compile(r"[\|\\/()\[\]\"'׳״.,\-]+")
_space_re  = re.compile(r"\s+")
_token_re  = re.compile(r"\s+")

def normalize(txt: str | None) -> str:
    """נירמול משופר: lowercase → הורדת סימני פיסוק → רווח יחיד → תעתיק לטיני."""
    if not txt:
        return ""
    t = str(txt).lower()
    t = _punc_re.sub(" ", t)
    t = _space_re.sub(" ", t).strip()
    return unidecode.unidecode(t)

def _clean_token(tok: str) -> str:
    """מסיר ו' חיבור וסיומת i, ומתעלם מ־SUFFIX_TOKENS"""
    if tok in SUFFIX_TOKENS:
        return ""
    if tok.startswith("v") and len(tok) > 2:
        tok = tok[1:]
    if len(tok) >= 4 and tok.endswith("i"):
        tok = tok[:-1]
    return tok

def _tokens(name: str) -> List[str]:
    """מחזיר רשימת טוקנים נקייה אחרי סינון מילים גנריות וסיומות"""
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
    """עיצוב טלפון: 972 -> 0, פורמט XXX-XXXXXXX"""
    d = "".join(filter(str.isdigit, str(ph)))
    if d.startswith("972"):
        d = "0" + d[3:]
    return f"{d[:3]}-{d[3:]}" if len(d) == 10 else d

# ───────── זיהוי אוטומטי של עמודות עם שיפורים ─────────
def detect_column_type(col_name: str, sample_data: pd.Series) -> str:
    """זיהוי אוטומטי של סוג העמודה לפי שם ותוכן"""
    col_lower = str(col_name).lower().strip()
    
    # בדיקת תוכן העמודה
    sample_str = sample_data.astype(str).str.lower()
    
    # עמודת טלפון
    phone_keywords = ['טלפון', 'פלאפון', 'נייד', 'סלולר', 'phone', 'mobile', 'cell', 'מספר']
    has_phone_keyword = any(keyword in col_lower for keyword in phone_keywords)
    has_digits = sample_str.str.contains(r'\d{9,}').any()
    
    if has_phone_keyword or has_digits:
        return 'phone'
    
    # עמודת שם
    name_keywords = ['שם', 'name', 'מוזמן', 'guest', 'אורח', 'משתתף']
    has_name_keyword = any(keyword in col_lower for keyword in name_keywords)
    has_hebrew_letters = sample_str.str.contains(r'[א-ת]').any()
    has_english_letters = sample_str.str.contains(r'[a-z]').any()
    
    if has_name_keyword or has_hebrew_letters or has_english_letters:
        return 'name'
    
    # עמודת כמות
    count_keywords = ['כמות', 'מספר', 'קאונט', 'count', 'qty', 'quantity', 'אורחים', 'מוזמנים']
    has_count_keyword = any(keyword in col_lower for keyword in count_keywords)
    is_numeric = pd.to_numeric(sample_data, errors='coerce').notna().sum() > len(sample_data) * 0.7
    
    if has_count_keyword or is_numeric:
        return 'count'
    
    # עמודת צד
    side_keywords = ['צד', 'side', 'חתן', 'כלה', 'groom', 'bride']
    if any(keyword in col_lower for keyword in side_keywords):
        return 'side'
    
    # עמודת קבוצה
    group_keywords = ['קבוצה', 'group', 'סוג', 'type', 'קטגוריה', 'category', 'יחס', 'relation', 'משפחה', 'חברים', 'עבודה']
    if any(keyword in col_lower for keyword in group_keywords):
        return 'group'
    
    return 'other'

def smart_column_mapping(df: pd.DataFrame) -> Dict[str, str]:
    """מיפוי חכם של עמודות לפי תוכן ושם"""
    mapping = {}
    
    for col in df.columns:
        col_type = detect_column_type(col, df[col].head(10))
        mapping[col] = col_type
    
    return mapping

def identify_relevant_fields(df: pd.DataFrame) -> Dict[str, str]:
    """זיהוי השדות הרלוונטיים ביותר לתצוגה"""
    column_mapping = smart_column_mapping(df)
    relevant_fields = {}
    
    # חפש צד
    side_cols = [col for col, type_val in column_mapping.items() if type_val == 'side']
    if side_cols:
        relevant_fields['צד'] = side_cols[0]
    
    # חפש קבוצה
    group_cols = [col for col, type_val in column_mapping.items() if type_val == 'group']
    if group_cols:
        relevant_fields['קבוצה'] = group_cols[0]
    
    # חפש כמות
    count_cols = [col for col, type_val in column_mapping.items() if type_val == 'count']
    if count_cols:
        relevant_fields['כמות'] = count_cols[0]
    
    return relevant_fields

# ───────── טעינת קבצים גמישה עם שיפורים ─────────
def load_excel_flexible(file) -> pd.DataFrame:
    """טעינת קובץ עם זיהוי אוטומטי של עמודות וטיפול בפורמטים שונים"""
    try:
        print(f"📁 Attempting to read file: {getattr(file, 'filename', 'unknown')}")
        
        # קריאת הקובץ
        if hasattr(file, "filename") and str(file.filename).lower().endswith(".csv"):
            df = pd.read_csv(file, encoding='utf-8')
        else:
            df = pd.read_excel(file)
        
        print(f"📊 Raw file data - Shape: {df.shape}")
        print(f"📋 Original columns: {list(df.columns)}")
        
        # ניקוי שמות עמודות
        df.columns = [str(col).strip() for col in df.columns]
        df = df.dropna(how='all')
        
        if len(df) == 0:
            raise Exception("הקובץ ריק או לא מכיל נתונים")
        
        # זיהוי אם זה קובץ אנשי קשר עם הפורמט הקבוע שלך
        is_contacts_file = (
            len(df.columns) >= 3 and 
            df.iloc[:, 0].astype(str).str.contains(r'972\d{9}').any()  # עמודה A מכילה מספרי טלפון
        )
        
        # יצירת עמודות סטנדרטיות
        standard_df = pd.DataFrame()
        
        if is_contacts_file:
            print("📞 Detected contacts file with fixed format")
            # פורמט קבוע: A=טלפון, B=שם קצר, C=שם מלא
            standard_df[PHONE_COL] = df.iloc[:, 0].astype(str).str.strip()  # עמודה A
            standard_df[NAME_COL] = df.iloc[:, 2].astype(str).str.strip()   # עמודה C
        else:
            print("👰 Detected guests file - using flexible detection")
            # זיהוי אוטומטי לקובץ מוזמנים
            column_mapping = smart_column_mapping(df)
            relevant_fields = identify_relevant_fields(df)
            
            # מציאת עמודת שם
            name_cols = [col for col, type_val in column_mapping.items() if type_val == 'name']
            if name_cols:
                best_name_col = max(name_cols, key=lambda col: df[col].astype(str).str.len().mean())
                standard_df[NAME_COL] = df[best_name_col].astype(str).str.strip()
            else:
                standard_df[NAME_COL] = df.iloc[:, 0].astype(str).str.strip()
            
            # עמודת טלפון (אופציונלית למוזמנים)
            phone_cols = [col for col, type_val in column_mapping.items() if type_val == 'phone']
            if phone_cols:
                standard_df[PHONE_COL] = df[phone_cols[0]].astype(str).str.strip()
            else:
                standard_df[PHONE_COL] = ""
            
            # שמירה של שדות רלוונטיים
            for display_name, col_name in relevant_fields.items():
                if col_name in df.columns:
                    standard_df[display_name] = df[col_name].astype(str).fillna("")
        
        # שדות נוספים
        if COUNT_COL not in standard_df.columns:
            standard_df[COUNT_COL] = 1
        if SIDE_COL not in standard_df.columns:
            standard_df[SIDE_COL] = ""
        if GROUP_COL not in standard_df.columns:
            standard_df[GROUP_COL] = ""
        
        # נירמול שמות
        standard_df["norm_name"] = standard_df[NAME_COL].map(normalize)
        
        # סינון רשומות ריקות
        standard_df = standard_df[standard_df["norm_name"].str.strip() != ""]
        
        if len(standard_df) == 0:
            raise Exception("לא נמצאו רשומות תקינות עם שמות")
        
        print(f"✅ Processing complete! Final shape: {standard_df.shape}")
        return standard_df
        
    except Exception as e:
        print(f"❌ Error: {e}")
        raise Exception(f"לא ניתן לקרוא את הקובץ: {str(e)}")

def load_mobile_contacts(contacts_data: List[Dict]) -> pd.DataFrame:
    """טעינת אנשי קשר ממובייל"""
    try:
        print(f"📱 Loading mobile contacts: {len(contacts_data)} contacts")
        
        # יצירת DataFrame מאנשי הקשר
        df = pd.DataFrame(contacts_data)
        
        # וידוא שיש עמודות name ו-phone
        if 'name' not in df.columns or 'phone' not in df.columns:
            raise Exception("פורמט אנשי קשר לא תקין - חסרות עמודות name או phone")
        
        # יצירת עמודות סטנדרטיות
        standard_df = pd.DataFrame()
        standard_df[NAME_COL] = df['name'].astype(str).str.strip()
        standard_df[PHONE_COL] = df['phone'].astype(str).str.strip()
        
        # שדות נוספים
        standard_df[COUNT_COL] = 1
        standard_df[SIDE_COL] = ""
        standard_df[GROUP_COL] = ""
        
        # נירמול שמות
        standard_df["norm_name"] = standard_df[NAME_COL].map(normalize)
        
        # סינון רשומות ריקות
        standard_df = standard_df[
            (standard_df["norm_name"].str.strip() != "") & 
            (standard_df[PHONE_COL].str.strip() != "")
        ]
        
        if len(standard_df) == 0:
            raise Exception("לא נמצאו אנשי קשר תקינים")
        
        print(f"✅ Mobile contacts processed! Final count: {len(standard_df)}")
        return standard_df
        
    except Exception as e:
        print(f"❌ Error processing mobile contacts: {e}")
        raise Exception(f"לא ניתן לעבד את אנשי הקשר: {str(e)}")

def create_contacts_template() -> pd.DataFrame:
    """יוצר קובץ דוגמה לאנשי קשר"""
    template = pd.DataFrame({
        'שם מלא': [
            'ישראל ישראלי',
            'שרה כהן',
            'דוד לevi',
            'רחל אברהם'
        ],
        'מספר פלאפון': [
            '0501234567',
            '0529876543',
            '0521111111',
            '0502222222'
        ]
    })
    return template

def create_guests_template() -> pd.DataFrame:
    """יוצר קובץ דוגמה למוזמנים"""
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

# הפונקציה הישנה נשארת לתאימות לאחור
def load_excel(file) -> pd.DataFrame:
    """טוען CSV/XLSX עם זיהוי אוטומטי, מנרמל ומוודא עמודות חובה."""
    return load_excel_flexible(file)

# ───────── מערכת הרשאות: Google Sheets + קובץ גיבוי ─────────
def _pick_worksheet(sh):
    """מאתר לשונית לפי שם (לא רגיש לרישיות/רווחים). אם אין/לא נמצא – הראשונה."""
    wanted = os.getenv(WORKSHEET_TITLE_ENV)
    if wanted:
        w = wanted.strip().lower()
        for ws in sh.worksheets():
            if (ws.title or "").strip().lower() == w:
                return ws
    return sh.get_worksheet(0)

def _find_phone_col(header: list[str]) -> int:
    """אינדקס עמודת הטלפון לפי כותרת (case-insensitive). אם לא נמצא – B (1)."""
    header_lower = [str(h).strip().lower() for h in header]
    lookup = tuple(x.lower() for x in ("טלפון", "מספר פלאפון", "פלאפון", "phone", "מספר"))
    for i, h in enumerate(header_lower):
        if h in lookup:
            return i
    return 1

def _load_allowed_from_sheets() -> set[str] | None:
    """טוען סט טלפונים מורשים מ-Sheets דרך ADC. מחזיר None אם אין/שגיאה (כדי לאפשר גיבוי)."""
    if not GOOGLE_AVAILABLE:
        logging.info("Google Sheets not available - skipping")
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
            logging.info("Allowed sheet is empty or header-only.")
            return set()

        header = [str(c).strip() for c in rows[0]]
        phone_idx = _find_phone_col(header)

        allowed = {
            only_digits(r[phone_idx])
            for r in rows[1:]
            if len(r) > phone_idx and only_digits(r[phone_idx])
        }

        if allowed:
            logging.info("Loaded %d allowed phones from Sheets.", len(allowed))
        else:
            logging.info("No allowed phones found in Sheets after normalization.")
        return allowed
    except Exception:
        logging.exception("Failed to load allowed phones from Sheets")
        return None

def _load_allowed_from_excel() -> set[str]:
    """גיבוי: טוען טלפונים מורשים מ-allowed_users.xlsx (אם קיים)."""
    if not os.path.exists(LOCAL_ALLOWED_FILE):
        return set()
    try:
        df = pd.read_excel(LOCAL_ALLOWED_FILE, dtype=str)
    except Exception:
        logging.exception("Failed to read local allowed Excel")
        return set()

    cols = [c for c in df.columns if any(k in str(c).lower() for k in LOCAL_PHONE_COLS)]
    if not cols:
        return set()

    phone_col = cols[0]
    allowed = {only_digits(str(v)) for v in df[phone_col] if only_digits(str(v))}
    logging.info("Loaded %d allowed phones from local Excel.", len(allowed))
    return allowed

def is_user_authorized(phone: str) -> bool:
    """True אם המספר (אחרי נורמליזציה) מופיע ברשימת המורשים (Sheets או Excel מקומי)."""
    clean = only_digits(phone)
    allowed = _load_allowed_from_sheets()
    if allowed is None:
        allowed = _load_allowed_from_excel()
    return clean in allowed

# ───────── אלגוריתם התאמה מתקדם ─────────
def full_score(g_norm: str, c_norm: str) -> int:
    """ציון התאמה 0–100 בין שני שמות מנורמלים עם אלגוריתם משופר."""
    if not g_norm or not c_norm:
        return 0
    if g_norm.strip() == c_norm.strip():
        return AUTO_SCORE
        
    g_t, c_t = _tokens(g_norm), _tokens(c_norm)
    
    # התאמה מלאה לאחר ניקוי (core‑tokens זהים)
    if g_t == c_t:
        return AUTO_SCORE
    
    if not g_t or not c_t:
        return fuzz.partial_ratio(g_norm, c_norm)
    
    # חישוב רכיבי הציון
    tr = fuzz.token_set_ratio(" ".join(g_t), " ".join(c_t)) / 100
    fr = fuzz.ratio(g_t[0], c_t[0]) / 100
    jr = _fuzzy_jaccard(g_t, c_t)
    
    # ענישה קלה על פער טוקנים >= 2
    gap = abs(len(g_t) - len(c_t))
    penalty = (min(len(g_t), len(c_t)) / max(len(g_t), len(c_t))) if gap >= 2 else 1
    
    score = (0.6 * tr + 0.2 * fr + 0.2 * jr) * penalty * 100
    return int(round(score))

def reason_for(g_norm: str, c_norm: str, score: int) -> str:
    """מחזיר הסבר קצר למה ניתן הציון הזה"""
    overlap = [t for t in _tokens(g_norm) if t in set(_tokens(c_norm))]
    if overlap:
        return f"חפיפה: {', '.join(overlap[:2])}"
    if score >= AUTO_SELECT_TH:
        return "התאמה גבוהה"
    return ""

def to_buf(df: pd.DataFrame) -> BytesIO:
    """ייצוא ל-Excel: מסיר עמודות פנימיות ומשאיר טלפון בסוף."""
    export = df.drop(columns=["norm_name", "score", "best_score"], errors="ignore").copy()
    
    # סדר עמודות: שם מלא ראשון, טלפון אחרון, השאר באמצע
    columns_order = []
    
    # שם מלא ראשון
    if NAME_COL in export.columns:
        columns_order.append(NAME_COL)
    
    # כל השאר חוץ מטלפון
    for col in export.columns:
        if col not in [NAME_COL, PHONE_COL]:
            columns_order.append(col)
    
    # טלפון אחרון
    if PHONE_COL in export.columns:
        columns_order.append(PHONE_COL)
    
    # סדר מחדש
    export = export.reindex(columns=columns_order, fill_value="")
    
    buf = BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as w:
        export.to_excel(w, index=False, sheet_name="תוצאות")
    buf.seek(0)
    return buf

# ───────── מערכת התאמות מתקדמת ─────────
def top_matches(guest_norm: str, contacts_df: pd.DataFrame) -> pd.DataFrame:
    """
    בוחר למוזמן עם השם המנורמל guest_norm את המועמדים הטובים ביותר מה־contacts_df לפי:
    1. אם יש התאמה מושלמת (100%) – עד 3 תוצאות עם score >= 90.
    2. אחרת – עד 3 תוצאות עם score >= MIN_SCORE_DISPLAY (70).
    3. אם אין כאלה – עד 3 תוצאות עם score >= 55 (threshold fallback).
    
    לוגיקה מתקדמת המבטיחה תוצאות איכותיות.
    """
    if not guest_norm:
        return pd.DataFrame(columns=list(contacts_df.columns) + ["score", "reason"])

    # 1) מחשיבים את כל הציונים
    scores = contacts_df["norm_name"].apply(lambda c: full_score(guest_norm, c))
    df     = contacts_df.assign(score=scores)

    # 2) בודקים האם יש Perfect Match (100%)
    max_score = int(df["score"].max())
    if max_score == AUTO_SCORE:
        candidates = (
            df[df["score"] >= 90]
            .sort_values(["score", NAME_COL], ascending=[False, True])
            .head(3)
            .copy()
        )
    else:
        # 3) מציגים לפחות MIN_SCORE_DISPLAY
        candidates = (
            df[df["score"] >= MIN_SCORE_DISPLAY]
            .sort_values(["score", NAME_COL], ascending=[False, True])
            .head(3)
            .copy()
        )
        # 4) fallback – אם אין כלל מועמדים ≥MIN_SCORE_DISPLAY, נציג לפחות מעל 50
        if candidates.empty:
            candidates = (
                df[df["score"] >= 50]
                .sort_values(["score", NAME_COL], ascending=[False, True])
                .head(3)
                .copy()
            )

    # 5) מוסיפים עמודת 'reason' להסבר התאמה
    candidates["reason"] = [
        reason_for(guest_norm, row["norm_name"], int(row["score"]))
        for _, row in candidates.iterrows()
    ]
    return candidates

def compute_best_scores(guests_df: pd.DataFrame, contacts_df: pd.DataFrame) -> pd.Series:
    """מחשב את הציון הטוב ביותר לכל מוזמן מול כל אנשי הקשר"""
    return guests_df["norm_name"].apply(
        lambda n: int(contacts_df["norm_name"].apply(lambda c: full_score(n, c)).max()) if n else 0
    )

def extract_relevant_guest_details(guest_row: pd.Series) -> Dict[str, str]:
    """מחלץ רק הפרטים הרלוונטיים של המוזמן לתצוגה"""
    relevant_details = {}
    
    # רשימת שדות פוטנציאליים לצד
    side_fields = ['צד', 'side', 'חתן', 'כלה', 'groom', 'bride']
    for field in side_fields:
        if field in guest_row.index and pd.notna(guest_row[field]) and str(guest_row[field]).strip():
            relevant_details['צד'] = str(guest_row[field]).strip()
            break
    
    # רשימת שדות פוטנציאליים לקבוצה
    group_fields = ['קבוצה', 'group', 'קטגוריה', 'category', 'סוג', 'type', 'יחס', 'relation']
    for field in group_fields:
        if field in guest_row.index and pd.notna(guest_row[field]) and str(guest_row[field]).strip():
            relevant_details['קבוצה'] = str(guest_row[field]).strip()
            break
    
    # רשימת שדות פוטנציאליים לכמות
    count_fields = ['כמות', 'quantity', 'מספר מוזמנים', 'אורחים', 'כמות מוזמנים']
    for field in count_fields:
        if field in guest_row.index and pd.notna(guest_row[field]) and str(guest_row[field]).strip():
            relevant_details['כמות'] = str(guest_row[field]).strip()
            break
    
    return relevant_details

def process_matching_results(guests_df: pd.DataFrame, contacts_df: pd.DataFrame, contacts_source: str = 'file') -> List[Dict]:
    """עיבוד מלא של תוצאות ההתאמה עם שיפורים"""
    results = []
    
    for idx, (_, guest) in enumerate(guests_df.iterrows()):
        guest_name = guest[NAME_COL]
        guest_norm = guest["norm_name"]
        
        # חילוץ פרטים רלוונטיים בלבד
        guest_details = extract_relevant_guest_details(guest)
        guest_details[NAME_COL] = guest_name  # הוסף את השם
        
        # מציאת מועמדים
        candidates = top_matches(guest_norm, contacts_df)
        best_score = candidates["score"].max() if len(candidates) > 0 else 0
        
        # הכנת רשימת מועמדים
        candidates_list = []
        for _, candidate in candidates.iterrows():
            candidates_list.append({
                "name": candidate[NAME_COL],
                "phone": format_phone(candidate[PHONE_COL]),
                "score": int(candidate["score"]),
                "reason": candidate.get("reason", "")
            })
        
        results.append({
            "index": idx,
            "guest": guest_name,
            "guest_details": guest_details,
            "best_score": int(best_score),
            "candidates": candidates_list
        })
    
    return results