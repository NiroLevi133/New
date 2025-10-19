import React from 'react';

// 🔥 חדש: שלב הזנת טלפון
const PhoneScreen = ({ phoneValue, setPhoneValue, isLoading, sendCode }) => (
  <div className="auth-fields-visible">
    <p>הזן את מספר הטלפון שלך כדי להתחיל</p>
    <div>
      <label>מספר טלפון</label>
      <input
        type="tel"
        placeholder="05X-XXXXXXX"
        value={phoneValue}
        onChange={(e) => setPhoneValue(e.target.value)}
        disabled={isLoading}
      />
    </div>

    {isLoading && <div className="loading-spinner"></div>}

    <button
      className="btn btn-primary"
      onClick={sendCode}
      disabled={isLoading}
      type="button"
      style={{
        display: 'block',
        margin: '25px auto',
        minWidth: '220px',
        fontSize: '1.1rem',
      }}
    >
      {isLoading ? '⏳ שולח...' : '📱 שלח קוד אימות'}
    </button>
  </div>
);

// 🔥 חדש: שלב הזנת קוד
const CodeScreen = ({ codeValue, setCodeValue, isLoading, verifyCode, sendCode, backToPhoneScreen }) => (
  <div className="auth-fields-visible">
    <p>קוד האימות נשלח אליך לוואטסאפ.</p>
    <div>
      <label>קוד אימות מווטסאפ</label>
      <input
        type="text"
        placeholder="הזן קוד בן 4 ספרות"
        value={codeValue}
        onChange={(e) => setCodeValue(e.target.value)}
        disabled={isLoading}
        maxLength={4}
        style={{
          textAlign: 'center',
          fontSize: '1.5rem',
          letterSpacing: '0.5rem',
          marginBottom: '15px',
        }}
      />
    </div>

    {isLoading && <div className="loading-spinner"></div>}

    <button
      className="btn btn-primary"
      onClick={verifyCode}
      disabled={isLoading}
      type="button"
      style={{
        display: 'block',
        margin: '25px auto 10px auto',
        minWidth: '220px',
        fontSize: '1.1rem',
      }}
    >
      {isLoading ? '⏳ בודק...' : '✅ אמת קוד'}
    </button>

    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        gap: '10px',
        marginTop: '10px',
      }}
    >
      <button
        className="btn btn-secondary btn-small"
        onClick={sendCode}
        disabled={isLoading}
        type="button"
      >
        🔄 שלח שוב
      </button>

      <button
        className="btn btn-secondary btn-small"
        onClick={backToPhoneScreen}
        disabled={isLoading}
        type="button"
      >
        ⬅️ חזור
      </button>
    </div>
  </div>
);

// 🔥 חדש: שלב הזנת שם מלא (מוצג רק למשתמש חדש)
const FullNameScreen = ({ fullNameValue, setFullNameValue, isLoading, saveFullName, backToCodeScreen }) => (
  <div className="auth-fields-visible">
    <p style={{ fontWeight: 'bold' }}>
      🎉 כניסה ראשונה! כדי לשמור את ההתקדמות שלך, אנא הזן את השם המלא של הזוג.
    </p>
    <div>
      <label>שם מלא של הזוג</label>
      <input
        type="text"
        placeholder="שם מלא של החתן והכלה"
        value={fullNameValue}
        onChange={(e) => setFullNameValue(e.target.value)}
        disabled={isLoading}
      />
    </div>

    {isLoading && <div className="loading-spinner"></div>}

    <button
      className="btn btn-primary"
      onClick={saveFullName}
      disabled={isLoading || fullNameValue.trim().length < 2}
      type="button"
      style={{
        display: 'block',
        margin: '25px auto 10px auto',
        minWidth: '220px',
        fontSize: '1.1rem',
      }}
    >
      {isLoading ? '⏳ שומר...' : '🚀 התחל עבודה'}
    </button>
    
    <button
      className="btn btn-secondary btn-small"
      onClick={backToCodeScreen}
      disabled={isLoading}
      type="button"
    >
      ⬅️ חזור לאימות
    </button>
  </div>
);


// 🔥 מנהל המסכים הראשי של האימות
const AuthScreen = ({ 
  authStep,
  phoneValue, 
  setPhoneValue, 
  fullNameValue, 
  setFullNameValue,
  codeValue,
  setCodeValue,
  isLoading,
  sendCode,
  verifyCode,
  saveFullName,
  backToPhoneScreen,
  backToCodeScreen
}) => {
  return (
    <div className="auth-screen" style={{ textAlign: 'center' }}>
      <h2>🔐 אימות משתמש</h2>

      {authStep === 'phoneScreen' && (
        <PhoneScreen 
          phoneValue={phoneValue}
          setPhoneValue={setPhoneValue}
          isLoading={isLoading}
          sendCode={sendCode}
        />
      )}
      
      {authStep === 'codeScreen' && (
        <CodeScreen 
          codeValue={codeValue}
          setCodeValue={setCodeValue}
          isLoading={isLoading}
          verifyCode={verifyCode}
          sendCode={sendCode}
          backToPhoneScreen={backToPhoneScreen}
        />
      )}

      {authStep === 'nameScreen' && (
        <FullNameScreen
          fullNameValue={fullNameValue}
          setFullNameValue={setFullNameValue}
          isLoading={isLoading}
          saveFullName={saveFullName}
          backToCodeScreen={backToCodeScreen}
        />
      )}
    </div>
  );
};

// ... (שאר הקומפוננטות נשארות כפי שהיו)
const LandingPage = ({ onStart }) => {
  return (
    <div style={{ textAlign: 'center' }}>
      {/* כותרת מעודכנת */}
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
          {/* שינוי ההדגשה לחיסכון בזמן */}
          <li>⏱️ <strong>חיסכון בזמן מטורף:</strong> המערכת מכניסה את מספרי הפלאפון לאקסל במקומך! אתה לא צריך לחפש ולהתאים מספר-מספר לכל מוזמן.</li>
          <li>🎯 <strong>100% דיוק:</strong> התאמה מושלמת – נמצא מיד!</li>
          <li>💾 <strong>הוספה ישירה:</strong> מוסיפה את המספרים הנכונים ישירות לקובץ האקסל המקורי שלך.</li>
          <li>🔍 <strong>בחירה חכמה:</strong> נותנת 3 מועמדים מובילים לבחירה במקרים מורכבים.</li>
          <li>📩 <strong>ייצוא מיידי:</strong> תוך דקות תקבל קובץ מוכן לשליחת אישורי הגעה.</li>
          <li>💰 <strong>30 התאמות חינם</strong> כל 24 שעות.</li>
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


const LimitReachedScreen = ({ 
  currentUser, 
  selectedContactsCount,
  onExport,
  onUpgrade 
}) => {
  return (
    <div style={{ textAlign: 'center' }}>
      <h2>⏰ נגמרו ההתאמות היומיות</h2>
      
      <div style={{ fontSize: '3rem', margin: '20px 0' }}>🎉</div>
      
      <div className="stats-box">
        <div>✅ עיבדת היום: <strong>30</strong> מוזמנים</div>
        <div>📊 סה״כ התאמות: <strong>{selectedContactsCount}</strong></div>
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '30px' }}>
        <div className="option-card">
          <h3>⏳ חזור מחר (חינם)</h3>
          <p>המגבלה תתאפס בעוד:</p>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
            {currentUser.hoursUntilReset > 0 
              ? `${Math.floor(currentUser.hoursUntilReset)} שעות` 
              : '24 שעות'}
          </div>
          <button className="btn btn-secondary" onClick={onExport}>
            📥 הורד את מה שיש כרגע
          </button>
        </div>
        
        <div className="option-card premium">
          <div className="badge">💎 מומלץ</div>
          <h3>המשך עכשיו (39₪)</h3>
          <ul style={{ textAlign: 'right', listStyle: 'none' }}>
            <li>✅ ללא הגבלת התאמות</li>
            <li>✅ תמיכה מהירה</li>
            <li>✅ גישה לכל התכונות</li>
          </ul>
          <button className="btn btn-primary" onClick={onUpgrade}>
            💳 שדרג לפרימיום
          </button>
        </div>
      </div>
    </div>
  );
};

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


export { AuthScreen, LandingPage, LimitReachedScreen, ContactsGuideModal };