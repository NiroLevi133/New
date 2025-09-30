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
    
    # פונקציות בדיקה
    'validate_dataframes',
    'is_user_authorized',
    
    # פונקציות ייצוא
    'to_buf',
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
    'AUTO_SELECT_TH',  # 🔥 חשוב!
    'MIN_SCORE_DISPLAY',
    'MAX_DISPLAYED',
]



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

# 🔥 ניקוי טוקנים מתקדם
def _clean_token(tok: str) -> str:
    """מסיר ו' חיבור, סיומת i, ומתעלם מ־SUFFIX_TOKENS"""
    if tok in SUFFIX_TOKENS:
        return ""
    # הסרת ו' חיבור: "ודוד" → "דוד"
    if tok.startswith("v") and len(tok) > 2:
        tok = tok[1:]
    # הסרת סיומת i: "davidi" → "david"
    if len(tok) >= 4 and tok.endswith("i"):
        tok = tok[:-1]
    return tok

def _tokens(name: str) -> List[str]:
    """מחזיר רשימת טוקנים נקייה אחרי סינון מילים גנריות וסיומות"""
    tks = [_clean_token(t) for t in _token_re.split(name)]
    return [t for t in tks if t and t not in GENERIC_TOKENS]

# 🔥 Fuzzy Equality (Levenshtein ≥ 90%)
def _fuzzy_eq(a: str, b: str) -> bool:
    """טוקנים זהים או דומים ≥ 90 % ב‑Levenshtein"""
    return a == b or distance.Levenshtein.normalized_similarity(a, b) >= 0.9

# 🔥 Fuzzy Jaccard
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

# 🔥 זיהוי שם מלא חכם (שם פרטי + משפחה)
def _resolve_full_name_series(df: pd.DataFrame) -> pd.Series:
    """
    מאחד שם פרטי+משפחה / מזהה 'שם מלא' / דמויות שם – ומחזיר Series.
    אלגוריתם מתקדם לזיהוי וחיבור עמודות שם.
    """
    cols = list(df.columns)
    low = {c: str(c).strip().lower() for c in cols}
    
    # זיהוי ישיר של עמודת שם מלא
    direct = {"שם מלא", "full name", "fullname", "guest name", "שם המוזמן", "name"}
    for c in cols:
        if low[c] in direct:
            return df[c].fillna("").astype(str).str.strip()
    
    # חיבור שם פרטי + משפחה
    first = [c for c in cols if "פרטי" in low[c] or low[c] in {"שם", "first", "firstname", "given"}]
    last  = [c for c in cols if "משפחה" in low[c] or low[c] in {"last", "lastname", "surname", "family"}]
    
    if first and last:
        # בחר את העמודות הטובות ביותר
        f = first[0]
        l = last[0]
        return (df[f].fillna("").astype(str).str.strip() + " " +
                df[l].fillna("").astype(str).str.strip()).str.replace(r"\s+", " ", regex=True).str.strip()
    
    # חיפוש עמודות דמויות שם
    name_like = [c for c in cols if any(k in low[c] for k in ["שם", "name", "guest", "מוזמן"])]
    if name_like:
        # בחר עמודה עם הכי הרבה תוכן
        best_col = max(name_like, key=lambda col: df[col].astype(str).str.len().mean())
        return df[best_col].fillna("").astype(str).str.strip()
    
    # אם לא מצאנו כלום - השתמש בעמודה הראשונה
    if len(df.columns) > 0:
        return df.iloc[:, 0].fillna("").astype(str).str.strip()
    
    return pd.Series([""] * len(df))

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
        
        # זיהוי אם זה קובץ אנשי קשר עם הפורמט הקבוע
        is_contacts_file = (
            len(df.columns) >= 3 and 
            df.iloc[:, 0].astype(str).str.contains(r'972\d{9}').any()
        )
        
        # יצירת עמודות סטנדרטיות
        standard_df = pd.DataFrame()
        
        if is_contacts_file:
            print("📞 Detected contacts file with fixed format")
            # פורמט קבוע: A=טלפון, C=שם מלא
            standard_df[PHONE_COL] = df.iloc[:, 0].astype(str).str.strip()
            standard_df[NAME_COL] = df.iloc[:, 2].astype(str).str.strip()
        else:
            print("👰 Detected guests file - using flexible detection")
            # זיהוי אוטומטי לקובץ מוזמנים
            column_mapping = smart_column_mapping(df)
            relevant_fields = identify_relevant_fields(df)
            
            # 🔥 שימוש באלגוריתם החכם לזיהוי שם
            standard_df[NAME_COL] = _resolve_full_name_series(df)
            
            # עמודת טלפון (אופציונלית למוזמנים)
            phone_cols = [col for col, type_val in column_mapping.items() if type_val == 'phone']
            if phone_cols:
                standard_df[PHONE_COL] = df[phone_cols[0]].astype(str).str.strip()
            else:
                standard_df[PHONE_COL] = ""
            
            # 🔥 חילוץ כמות מטקסט
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
            
            # שדות נוספים
            for display_name, col_name in relevant_fields.items():
                if col_name in df.columns:
                    standard_df[display_name] = df[col_name].astype(str).fillna("")
        
        # שדות חובה
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
        
        df = pd.DataFrame(contacts_data)
        
        if 'name' not in df.columns or 'phone' not in df.columns:
            raise Exception("פורמט אנשי קשר לא תקין")
        
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
        
        print(f"✅ Mobile contacts processed! Final count: {len(standard_df)}")
        return standard_df
        
    except Exception as e:
        print(f"❌ Error processing mobile contacts: {e}")
        raise Exception(f"לא ניתן לעבד את אנשי הקשר: {str(e)}")

def create_contacts_template() -> pd.DataFrame:
    """יוצר קובץ דוגמה לאנשי קשר"""
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
    """טוען CSV/XLSX עם זיהוי אוטומטי"""
    return load_excel_flexible(file)

# 🔥 אלגוריתם התאמה משופר (3 רכיבים משוקללים)
def full_score(g_norm: str, c_norm: str) -> int:
    """ציון התאמה 0–100 עם אלגוריתם מתקדם"""
    if not g_norm or not c_norm:
        return 0
    if g_norm.strip() == c_norm.strip():
        return AUTO_SCORE
        
    g_t, c_t = _tokens(g_norm), _tokens(c_norm)
    
    # התאמה מלאה לאחר ניקוי
    if g_t == c_t:
        return AUTO_SCORE
    
    if not g_t or not c_t:
        return fuzz.partial_ratio(g_norm, c_norm)
    
    # 🔥 חישוב 3 רכיבים משוקללים
    tr = fuzz.token_set_ratio(" ".join(g_t), " ".join(c_t)) / 100  # 60%
    fr = fuzz.ratio(g_t[0], c_t[0]) / 100  # 20% - התאמת טוקן ראשון
    jr = _fuzzy_jaccard(g_t, c_t)  # 20% - Fuzzy Jaccard
    
    # ענישה קלה על פער טוקנים >= 2
    gap = abs(len(g_t) - len(c_t))
    penalty = (min(len(g_t), len(c_t)) / max(len(g_t), len(c_t))) if gap >= 2 else 1
    
    score = (0.6 * tr + 0.2 * fr + 0.2 * jr) * penalty * 100
    return int(round(score))

def reason_for(g_norm: str, c_norm: str, score: int) -> str:
    """מחזיר הסבר קצר למה ניתן הציון"""
    overlap = [t for t in _tokens(g_norm) if t in set(_tokens(c_norm))]
    if overlap:
        return f"חפיפה: {', '.join(overlap[:2])}"
    if score >= AUTO_SELECT_TH:
        return "התאמה גבוהה"
    return ""

# 🔥 ייצוא חכם יותר (מחיקת שם כפול)
def to_buf(df: pd.DataFrame) -> BytesIO:
    """ייצוא ל-Excel: מסיר עמודות פנימיות"""
    # מחק עמודות פנימיות
    export = df.drop(
        columns=["norm_name", "score", "best_score"], 
        errors="ignore"
    ).copy()
    
    # סדר עמודות: כל העמודות המקוריות, טלפון בסוף
    if PHONE_COL in export.columns:
        cols = [col for col in export.columns if col != PHONE_COL]
        cols.append(PHONE_COL)
        export = export[cols]
    
    buf = BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as w:
        export.to_excel(w, index=False, sheet_name="תוצאות")
    buf.seek(0)
    return buf

# ───────── מערכת התאמות מתקדמת ─────────
def top_matches(guest_norm: str, contacts_df: pd.DataFrame) -> pd.DataFrame:
    """
    🔥 בחירת מועמדים הטובים ביותר עם בחירה אוטומטית ב-93%+
    """
    if not guest_norm:
        return pd.DataFrame(columns=list(contacts_df.columns) + ["score", "reason"])

    # חישוב ציונים
    scores = contacts_df["norm_name"].apply(lambda c: full_score(guest_norm, c))
    df     = contacts_df.assign(score=scores)

    # בדיקה אם יש Perfect Match (100%)
    max_score = int(df["score"].max())
    if max_score == AUTO_SCORE:
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

    # הוסף reason - תיקון: צור Series חדש במקום apply
    if len(candidates) > 0:
        reason_series = candidates.apply(
            lambda row: reason_for(guest_norm, row["norm_name"], row["score"]),
            axis=1
        )
        candidates = candidates.copy()
        candidates["reason"] = reason_series

    return candidates

# 🔥 חילוץ פרטי מוזמן רלוונטיים
def extract_relevant_guest_details(row: pd.Series) -> Dict:
    """חילוץ רק הפרטים הרלוונטיים של מוזמן"""
    details = {}
    
    # כל העמודות מלבד פנימיות
    exclude_cols = {NAME_COL, PHONE_COL, "norm_name", "score", "best_score"}
    
    for col in row.index:
        if col not in exclude_cols and pd.notna(row[col]) and str(row[col]).strip():
            details[col] = str(row[col])
    
    return details

# 🔥 חישוב ציון מקסימלי לכל מוזמן
def compute_best_scores(guests_df: pd.DataFrame, contacts_df: pd.DataFrame) -> pd.DataFrame:
    """מחשב את הציון הגבוה ביותר לכל מוזמן"""
    best_scores = []
    
    for _, guest_row in guests_df.iterrows():
        matches = top_matches(guest_row["norm_name"], contacts_df)
        best_score = int(matches["score"].max()) if len(matches) > 0 else 0
        best_scores.append(best_score)
    
    guests_df = guests_df.copy()
    guests_df["best_score"] = best_scores
    return guests_df

# 🔥 פונקציה מרכזית לעיבוד התאמות
def process_matching_results(guests_df: pd.DataFrame, contacts_df: pd.DataFrame, contacts_source: str = "file") -> List[Dict]:
    """
    עיבוד מלא של כל המוזמנים מול אנשי הקשר
    מחזיר רשימה של דיקטים עם כל המידע הדרוש ל-frontend
    """
    results = []
    
    # חשב ציונים מקסימליים
    guests_with_scores = compute_best_scores(guests_df, contacts_df)
    
    for _, guest_row in guests_with_scores.iterrows():
        guest_name = guest_row[NAME_COL]
        guest_norm = guest_row["norm_name"]
        best_score = guest_row["best_score"]
        
        # מצא מועמדים
        matches = top_matches(guest_norm, contacts_df)
        
        # המר מועמדים לפורמט frontend
        candidates = []
        auto_selected = None
        
        for _, match_row in matches.iterrows():
            candidate = {
                "name": match_row[NAME_COL],
                "phone": format_phone(match_row[PHONE_COL]),
                "score": int(match_row["score"]),
                "reason": match_row.get("reason", "")
            }
            candidates.append(candidate)
            
            # 🔥 בחירה אוטומטית אם הציון >= 93%
            if match_row["score"] >= AUTO_SELECT_TH and auto_selected is None:
                auto_selected = candidate
        
        # חלץ פרטים רלוונטיים של המוזמן
        guest_details = extract_relevant_guest_details(guest_row)
        
        result = {
            "guest": guest_name,
            "guest_details": guest_details,
            "candidates": candidates,
            "best_score": best_score,
            "auto_selected": auto_selected  # 🔥 מוסיף בחירה אוטומטית
        }
        
        results.append(result)
    
    return results


# ───────── מערכת הרשאות: Google Sheets + קובץ גיבוי ─────────
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
    """אינדקס עמודת הטלפון לפי כותרת"""
    header_lower = [str(h).strip().lower() for h in header]
    lookup = tuple(x.lower() for x in ("טלפון", "מספר פלאפון", "פלאפון", "phone", "מספר"))
    for i, h in enumerate(header_lower):
        if h in lookup:
            return i
    return 1

def _load_allowed_from_sheets() -> set[str] | None:
    """טוען סט טלפונים מורשים מ-Sheets"""
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
    """גיבוי: טוען טלפונים מורשים מ-allowed_users.xlsx"""
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

# logic.py - נוסיף פונקציה לבדיקת תקינות
def validate_dataframes(guests_df: pd.DataFrame, contacts_df: pd.DataFrame) -> tuple[bool, str]:
    """בודק שה-DataFrames תקינים לפני עיבוד"""
    
    # בדיקת מוזמנים
    if guests_df is None or len(guests_df) == 0:
        return False, "קובץ המוזמנים ריק או לא תקין"
    
    if NAME_COL not in guests_df.columns:
        return False, f"חסרה עמודה '{NAME_COL}' בקובץ המוזמנים"
    
    if "norm_name" not in guests_df.columns:
        return False, "שגיאת עיבוד - חסרה נורמליזציה של שמות מוזמנים"
    
    # בדיקת אנשי קשר
    if contacts_df is None or len(contacts_df) == 0:
        return False, "קובץ אנשי הקשר ריק או לא תקין"
    
    if NAME_COL not in contacts_df.columns:
        return False, f"חסרה עמודה '{NAME_COL}' בקובץ אנשי הקשר"
    
    if PHONE_COL not in contacts_df.columns:
        return False, f"חסרה עמודה '{PHONE_COL}' בקובץ אנשי הקשר"
    
    if "norm_name" not in contacts_df.columns:
        return False, "שגיאת עיבוד - חסרה נורמליזציה של שמות אנשי קשר"
    
    return True, "OK"


def is_user_authorized(phone: str) -> bool:
    """True אם המספר מופיע ברשימת המורשים"""
    clean = only_digits(phone)
    allowed = _load_allowed_from_sheets()
    if allowed is None:
        allowed = _load_allowed_from_excel()
    return clean in allowed