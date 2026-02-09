import React from 'react';

// ============================================================
// 🔥 NEW: Simple Register Screen - Name + Phone only
// ============================================================
const AuthScreen = ({
  phoneValue,
  setPhoneValue,
  fullNameValue,
  setFullNameValue,
  isLoading,
  onRegister,
  errorMessage
}) => {
  return (
    <div className="auth-screen" style={{ textAlign: 'center' }}>
      <h2>💍 ברוכים הבאים!</h2>
      <p style={{ fontSize: '1.1rem', color: '#555', marginBottom: '25px' }}>
        הזינו את הפרטים שלכם כדי להתחיל
      </p>

      <div className="auth-fields-visible">
        <div>
          <label>שם מלא (של הזוג)</label>
          <input
            type="text"
            placeholder="לדוגמה: ישראל ושרה כהן"
            value={fullNameValue}
            onChange={(e) => setFullNameValue(e.target.value)}
            disabled={isLoading}
          />
        </div>

        <div style={{ marginTop: '15px' }}>
          <label>מספר טלפון</label>
          <input
            type="tel"
            placeholder="05X-XXXXXXX"
            value={phoneValue}
            onChange={(e) => setPhoneValue(e.target.value)}
            disabled={isLoading}
          />
        </div>

        {errorMessage && (
          <div className="status-message status-error" style={{ marginTop: '15px' }}>
            {errorMessage}
          </div>
        )}

        {isLoading && <div className="loading-spinner"></div>}

        <button
          className="btn btn-primary"
          onClick={onRegister}
          disabled={isLoading || !phoneValue.trim() || !fullNameValue.trim()}
          type="button"
          style={{
            display: 'block',
            margin: '25px auto',
            minWidth: '220px',
            fontSize: '1.1rem',
          }}
        >
          {isLoading ? '⏳ נכנס...' : '🚀 התחל לעבוד!'}
        </button>

        <p style={{ fontSize: '0.85rem', color: '#999', marginTop: '15px' }}>
          🔒 הפרטים שלכם נשמרים בצורה מאובטחת ומשמשים רק לשמירת ההתקדמות שלכם
        </p>
      </div>
    </div>
  );
};


// ============================================================
// Landing Page - kept as is (minor cleanup)
// ============================================================
const LandingPage = ({ onStart }) => {
  return (
    <div style={{ textAlign: 'center' }}>
      <h2>💍 מערכת התאמת אנשי קשר אוטומטית למוזמנים שלך!</h2>
      <p>
        כבר לא צריך לשבור את הראש! מעלים את רשימת המוזמנים מהאקסל ואת אנשי הקשר שלך,
        והמערכת שלנו מתאימה אוטומטית את המספרים החסרים.
      </p>

      <div style={{
        background: 'linear-gradient(135deg, rgba(42, 157, 143, 0.1), rgba(244, 162, 97, 0.1))',
        padding: '20px',
        borderRadius: '15px',
        margin: '20px 0',
        textAlign: 'right'
      }}>
        <h3 style={{ textAlign: 'center' }}>✨ מה המערכת עושה עבורך?</h3>
        <ul style={{ listStyle: 'none', padding: 0, lineHeight: '1.8' }}>
          <li>⏱️ <strong>חיסכון בזמן מטורף:</strong> המערכת מכניסה את מספרי הפלאפון לאקסל במקומך!</li>
          <li>🎯 <strong>100% דיוק:</strong> התאמה מושלמת – נמצא מיד!</li>
          <li>💾 <strong>הוספה ישירה:</strong> מוסיפה את המספרים הנכונים ישירות לקובץ האקסל המקורי שלך.</li>
          <li>🔍 <strong>בחירה חכמה:</strong> נותנת 3 מועמדים מובילים לבחירה במקרים מורכבים.</li>
          <li>📩 <strong>ייצוא מיידי:</strong> תוך דקות תקבל קובץ מוכן לשליחת אישורי הגעה.</li>
          <li>🆓 <strong>חינם לגמרי</strong> – ללא הגבלת שימוש!</li>
        </ul>
      </div>

      <p style={{ fontWeight: 'bold', fontSize: '1.1em' }}>
        תוכנת האוטומציה שתשחרר אותך מהטבלאות ותעביר אותך לשליחת אישורים.
      </p>

      <button className="btn btn-primary" onClick={onStart}>
        🚀 בואו נתחיל!
      </button>
    </div>
  );
};


// ============================================================
// Contacts Guide Modal - kept as is
// ============================================================
const ContactsGuideModal = ({ onClose }) => {
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '20px'
    }}>
      <div style={{
        background: 'white',
        borderRadius: '20px',
        padding: '30px',
        maxWidth: '600px',
        maxHeight: '80vh',
        overflowY: 'auto',
        textAlign: 'right'
      }}>
        <h3 style={{ textAlign: 'center' }}>📖 מדריך הורדת אנשי קשר מ־WhatsApp</h3>

        <div style={{ marginTop: '25px', lineHeight: '1.8' }}>
          <ol style={{ listStyle: 'decimal', paddingRight: '20px' }}>
            <li>פתח דפדפן <strong>במחשב</strong> (לא בטלפון).</li>
            <li>
              התקן את התוסף
              <strong>
                <a
                  href="https://chromewebstore.google.com/detail/joni/aakppiadmnaeffmjijolmgmkcfhpglbh"
                  target="_blank"
                  rel="noopener noreferrer"
                > ג׳וני (Joni)</a>
              </strong>
              בדפדפן Chrome.
            </li>
            <li>
              היכנס אל
              <strong>
                <a
                  href="https://web.whatsapp.com"
                  target="_blank"
                  rel="noopener noreferrer"
                > WhatsApp Web</a>
              </strong>.
            </li>
            <li>לחץ על סמל <strong>J</strong> שמופיע בסרגל הכלים של הדפדפן.</li>
            <li>בחר <strong>אנשי קשר</strong> → <strong>שמירה לקובץ Excel</strong>.</li>
            <li>הקובץ יורד אוטומטית למחשב שלך 📂</li>
          </ol>
        </div>

        <div style={{
          background: '#f1f8ff',
          borderRadius: '10px',
          padding: '10px 15px',
          marginTop: '15px',
          fontSize: '0.95rem'
        }}>
          💡 <strong>חשוב:</strong> התוסף עובד רק בדפדפן <strong>Chrome</strong> במחשב.
        </div>

        <button
          className="btn btn-primary"
          onClick={onClose}
          style={{ marginTop: '25px', width: '100%' }}
        >
          ✅ הבנתי
        </button>
      </div>
    </div>
  );
};


export { AuthScreen, LandingPage, ContactsGuideModal };
