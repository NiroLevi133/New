import React from 'react';

// ============================================================
// Auth Screen - Registration form
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
    <div className="auth-screen">
      <h2 className="screen-heading">ברוכים הבאים!</h2>
      <p className="screen-subtitle">הזינו את הפרטים שלכם כדי להתחיל</p>

      <div className="auth-form">
        <div className="form-group">
          <label className="form-label">שם מלא (של הזוג)</label>
          <input
            type="text"
            className="form-input"
            placeholder="לדוגמה: ישראל ושרה כהן"
            value={fullNameValue}
            onChange={(e) => setFullNameValue(e.target.value)}
            disabled={isLoading}
          />
        </div>

        <div className="form-group">
          <label className="form-label">מספר טלפון</label>
          <input
            type="tel"
            className="form-input"
            placeholder="05X-XXXXXXX"
            value={phoneValue}
            onChange={(e) => setPhoneValue(e.target.value)}
            disabled={isLoading}
          />
        </div>

        {errorMessage && (
          <div className="status-message status-error">
            {errorMessage}
          </div>
        )}

        {isLoading && <div className="loading-spinner"></div>}

        <button
          className="btn btn-primary btn-cta"
          onClick={onRegister}
          disabled={isLoading || !phoneValue.trim() || !fullNameValue.trim()}
          type="button"
        >
          {isLoading ? 'נכנס...' : 'התחל לעבוד!'}
        </button>

        <p className="auth-privacy-note">
          הפרטים שלכם נשמרים בצורה מאובטחת ומשמשים רק לשמירת ההתקדמות שלכם
        </p>
      </div>
    </div>
  );
};


// ============================================================
// Landing Page
// ============================================================
const LandingPage = ({ onStart }) => {
  return (
    <div className="landing-page">
      <div className="landing-logo">
        <span className="landing-logo-icon">&#x1F48D;</span>
        <div className="landing-logo-text">WEDLINK</div>
      </div>

      <h1 className="landing-heading">
        חיבור רשימת המוזמנים שלך עם אנשי הקשר
      </h1>
      <p className="landing-subtitle">
        מעלים את רשימת המוזמנים מהאקסל ואת אנשי הקשר שלך,
        והמערכת שלנו מתאימה אוטומטית את המספרים החסרים - בלי ניחושים.
      </p>

      <div className="landing-benefits">
        <div className="benefit-item">
          <span className="benefit-icon">&#x23F1;</span>
          <div>
            <strong>חיסכון בזמן מטורף</strong>
            <p>המערכת מכניסה את מספרי הפלאפון לאקסל במקומך</p>
          </div>
        </div>
        <div className="benefit-item">
          <span className="benefit-icon">&#x1F3AF;</span>
          <div>
            <strong>דיוק מקסימלי</strong>
            <p>התאמה חכמה עם 3 מועמדים מובילים לבחירה במקרים מורכבים</p>
          </div>
        </div>
        <div className="benefit-item">
          <span className="benefit-icon">&#x1F4E9;</span>
          <div>
            <strong>ייצוא מיידי</strong>
            <p>תוך דקות תקבל קובץ מוכן לשליחת אישורי הגעה</p>
          </div>
        </div>
      </div>

      <button className="btn btn-primary btn-cta" onClick={onStart}>
        <span>&#x2764;</span> בואו נתחיל!
      </button>

      <p className="landing-free-badge">חינם לגמרי - ללא הגבלת שימוש</p>
    </div>
  );
};


// ============================================================
// Contacts Guide Modal
// ============================================================
const ContactsGuideModal = ({ onClose }) => {
  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ textAlign: 'right', maxWidth: '600px' }}>
        <h3 style={{ textAlign: 'center' }}>מדריך הורדת אנשי קשר מ-WhatsApp</h3>

        <div className="guide-content">
          <ol>
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
            <li>בחר <strong>אנשי קשר</strong> &rarr; <strong>שמירה לקובץ Excel</strong>.</li>
            <li>הקובץ יורד אוטומטית למחשב שלך</li>
          </ol>
        </div>

        <div className="guide-tip">
          <strong>חשוב:</strong> התוסף עובד רק בדפדפן <strong>Chrome</strong> במחשב.
        </div>

        <button
          className="btn btn-primary btn-cta"
          onClick={onClose}
        >
          הבנתי
        </button>
      </div>
    </div>
  );
};


export { AuthScreen, LandingPage, ContactsGuideModal };
