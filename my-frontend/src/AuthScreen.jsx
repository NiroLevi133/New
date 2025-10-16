import React from 'react';

const AuthScreen = ({ 
  phoneValue, 
  setPhoneValue, 
  fullNameValue, 
  setFullNameValue,
  codeValue,
  setCodeValue,
  showCodeInput,
  isLoading,
  sendCode,
  verifyCode,
  backToPhoneScreen
}) => {
  return (
    <div className="auth-screen" style={{ textAlign: 'center' }}>
      <h2>🔐 אימות המשתמש</h2>
      <p style={{ color: '#555', marginBottom: '25px' }}>הזן את פרטיך האישיים כדי להתחיל בחיבור המערכת.</p>

      {!showCodeInput && (
        <div className="auth-fields-visible">
          <div>
            <label style={{ display: 'block', textAlign: 'right', fontWeight: 'bold' }}>שם מלא</label>
            <input
              type="text"
              placeholder="יוסי כהן"
              value={fullNameValue}
              onChange={(e) => setFullNameValue(e.target.value)}
              disabled={isLoading}
            />
          </div>

          <div>
            <label style={{ display: 'block', textAlign: 'right', fontWeight: 'bold', marginTop: '15px' }}>מספר טלפון</label>
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
            disabled={isLoading || !phoneValue || !fullNameValue}
            type="button"
            style={{
              display: 'block',
              margin: '30px auto 0 auto',
              minWidth: '220px',
              fontSize: '1.1rem',
            }}
          >
            {isLoading ? '⏳ שולח...' : '📱 שלח קוד אימות בוואטסאפ'}
          </button>
        </div>
      )}

      {showCodeInput && (
        <div className="auth-fields-visible">
          <p style={{ fontWeight: 'bold', color: 'var(--primary-teal)' }}>
            ✅ קוד נשלח ל-{phoneValue}. אנא בדוק ב-WhatsApp.
          </p>
          <div>
            <label style={{ display: 'block', textAlign: 'right', fontWeight: 'bold' }}>קוד אימות (4 ספרות)</label>
            <input
              type="text"
              placeholder="****"
              value={codeValue}
              onChange={(e) => setCodeValue(e.target.value)}
              disabled={isLoading}
              maxLength={4}
              style={{
                textAlign: 'center',
                fontSize: '1.8rem',
                letterSpacing: '0.8rem',
                marginBottom: '15px',
              }}
            />
          </div>

          {isLoading && <div className="loading-spinner"></div>}

          <button
            className="btn btn-primary"
            onClick={verifyCode}
            disabled={isLoading || codeValue.length !== 4}
            type="button"
            style={{
              display: 'block',
              margin: '25px auto 10px auto',
              minWidth: '220px',
              fontSize: '1.1rem',
            }}
          >
            {isLoading ? '⏳ בודק...' : '✅ אמת קוד וכניסה'}
          </button>

          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '15px',
              marginTop: '15px',
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
              ⬅️ חזור לפרטים
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const LandingPage = ({ onStart }) => {
  return (
    <div style={{ textAlign: 'center' }}>
      <h2 style={{ marginBottom: '15px' }}>💍 התאמת אנשי קשר אוטומטית למוזמנים שלך!</h2>
      <p style={{ color: '#555', fontSize: '1.05rem', marginBottom: '30px' }}>
        מעלים את רשימת המוזמנים והמערכת שלנו מתאימה אוטומטית את מספרי הטלפון החסרים, 
        ומוכנה לשליחת אישורי הגעה תוך דקות.
      </p>

      <div className="landing-benefits-box">
        <h3 style={{ textAlign: 'center' }}>🚀 היתרונות של המערכת:</h3>
        <ul style={{ listStyle: 'none', padding: 0, lineHeight: '1.8' }}>
          <li>⏱️ <strong>חיסכון דרמטי בזמן:</strong> לא צריך לחפש ולהתאים מספר-מספר. המערכת עושה זאת במקומך.</li>
          <li>🎯 <strong>דיוק מוכח:</strong> שימוש באלגוריתם מתקדם לאיתור התאמות מושלמות ומומלצות (93%+).</li>
          <li>💾 <strong>שמירה על מבנה הקובץ:</strong> ייצוא הקובץ המעודכן תוך שמירה על כל הנתונים המקוריים.</li>
          <li>💰 <strong>30 התאמות חינם</strong> כל 24 שעות.</li>
        </ul>
      </div>

      <button className="btn btn-primary" onClick={onStart} style={{ fontSize: '1.3rem', padding: '18px 40px' }}>
        🚀 התחל עכשיו!
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
  // פונקציה מקומית קצרה להצגת שעות (לשם הדגמה)
  const formatTime = (hours) => {
    if (hours <= 0) return "ההגבלה אופסה!";
    const totalMinutes = Math.floor(hours * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h > 0) return `${h} שעות ו-${m} דקות`;
    return `${m} דקות`;
  };

  return (
    <div style={{ textAlign: 'center' }}>
      <h2>⏰ נגמרו ההתאמות היומיות</h2>
      
      <div style={{ fontSize: '3rem', margin: '20px 0' }}>🥺</div>
      
      <div style={{
          background: 'var(--light-gray)',
          padding: '20px',
          borderRadius: '10px',
          marginBottom: '30px',
          fontSize: '1.1rem'
      }}>
        <div style={{ marginBottom: '10px' }}>📊 סה״כ התאמות שאומתו: <strong>{selectedContactsCount}</strong></div>
        <div>⏱️ נותרו <strong>0</strong> התאמות מתוך 30.</div>
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* אופציה 1: חזור מחר */}
        <div style={{ padding: '20px', border: '1px solid #ccc', borderRadius: '15px' }}>
          <h3>⏳ חזור מחר (חינם)</h3>
          <p style={{ color: '#555' }}>המגבלה תתאפס בעוד:</p>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--primary-teal)' }}>
            {formatTime(currentUser.hoursUntilReset)}
          </div>
          <button className="btn btn-secondary" onClick={onExport} style={{ marginTop: '15px' }}>
            📥 הורד את מה שאושר עד כה
          </button>
        </div>
        
        {/* אופציה 2: שדרוג */}
        <div style={{ padding: '20px', border: '2px solid var(--primary-teal)', borderRadius: '15px', background: '#e6f9f7' }}>
          <div style={{ color: 'var(--primary-teal)', fontWeight: 'bold', marginBottom: '10px' }}>
            ⭐ מומלץ! פרימיום ⭐
          </div>
          <h3 style={{ color: 'var(--primary-teal)' }}>המשך עכשיו (39₪)</h3>
          <ul style={{ textAlign: 'right', listStyle: 'none', padding: 0, margin: '10px 0' }}>
            <li>✅ ללא הגבלת התאמות</li>
            <li>✅ גישה מלאה ל-24 שעות</li>
          </ul>
          <button className="btn btn-primary" onClick={onUpgrade} style={{ marginTop: '10px' }}>
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
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', zIndex: 9999, padding: '20px'
    }}>
      <div style={{
        background: 'white', borderRadius: '20px', padding: '30px',
        maxWidth: '550px', maxHeight: '80vh', overflowY: 'auto',
        textAlign: 'right'
      }}>
        <h3 style={{ textAlign: 'center', fontSize: '1.4rem' }}>📖 איך להוריד אנשי קשר מ־WhatsApp?</h3>

        <div style={{ marginTop: '25px', lineHeight: '1.8' }}>
          <ol style={{ listStyle: 'decimal', paddingRight: '20px', fontSize: '1.05rem' }}>
            <li>פתח דפדפן **במחשב** (Chrome/Edge).</li>
            <li>
              התקן את התוסף: 
              **
                <a 
                  href="https://chromewebstore.google.com/detail/joni/aakppiadmnaeffmjijolmgmkcfhpglbh"
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{ color: 'var(--primary-teal)', fontWeight: 'bold' }}
                > ג׳וני (Joni)</a>
              ** </li>
            <li>
              היכנס אל 
              **
                <a 
                  href="https://web.whatsapp.com"
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{ color: 'var(--primary-teal)', fontWeight: 'bold' }}
                > WhatsApp Web</a>
              ** (במחשב).
            </li>
            <li>לחץ על סמל **J** שמופיע בסרגל הכלים של הדפדפן.</li>
            <li>בחר **אנשי קשר** → **שמירה לקובץ Excel**.</li>
            <li>הקובץ יורד אוטומטית למחשב שלך 📂.</li>
          </ol>
        </div>

        <button 
          className="btn btn-primary"
          onClick={onClose}
          style={{ marginTop: '25px', width: '100%' }}
        >
          ✅ הבנתי, בוא נמשיך
        </button>
      </div>
    </div>
  );
};

export { AuthScreen, LandingPage, LimitReachedScreen, ContactsGuideModal };