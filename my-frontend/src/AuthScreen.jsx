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
      <h2>🔐 אימות משתמש</h2>
      <p>הזן את הפרטים שלך כדי להתחיל</p>

      {!showCodeInput && (
        <div className="auth-fields-visible">
          <div>
            <label>שם מלא</label>
            <input
              type="text"
              placeholder="הזן שם מלא"
              value={fullNameValue}
              onChange={(e) => setFullNameValue(e.target.value)}
              disabled={isLoading}
            />
          </div>

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
      )}

      {showCodeInput && (
        <div className="auth-fields-visible">
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
      )}
    </div>
  );
};

const LandingPage = ({ onStart }) => {
  return (
    <div style={{ textAlign: 'center' }}>
      <h2>💍 מערכת שתעשה לכם סוף סוף סדר ברשימת המוזמנים!</h2>
      <p>
        מכירים את זה שאתם צריכים לשלוח לאישורי הגעה רשימה עם שמות ומספרי טלפון,  
        אבל יש לכם רק את השמות? 😅  
        מעכשיו – לא צריך לשבור את הראש!  
      </p>

      <div style={{
        background: 'linear-gradient(135deg, rgba(42, 157, 143, 0.1), rgba(244, 162, 97, 0.1))',
        padding: '20px',
        borderRadius: '15px',
        margin: '20px 0',
        textAlign: 'right'
      }}>
        <h3 style={{ textAlign: 'center' }}>✨ מה המערכת עושה?</h3>
        <ul style={{ listStyle: 'none', padding: 0, lineHeight: '1.8' }}>
          <li>📂 מעלה את קובץ המוזמנים וקובץ אנשי הקשר שלך</li>
          <li>🤖 המערכת סורקת, משווה ומאתרת התאמות אוטומטיות</li>
          <li>🎯 100% התאמה מושלמת – נמצאה מיד!</li>
          <li>✨ 93%+ – בחירה חכמה מתוך 3 מועמדים מובילים</li>
          <li>📱 מוסיפה את המספרים הנכונים ישירות לקובץ שלך</li>
          <li>⚡ חוסכת שעות של עבודה ידנית ומשעממת</li>
          <li>💾 שמירה אוטומטית כל דקה</li>
          <li>🎁 30 התאמות חינם כל 24 שעות!</li>
        </ul>
      </div>

      <p style={{ fontWeight: 'bold', fontSize: '1.1em' }}>
        תוך דקות – תקבלו קובץ מוכן לאישורי הגעה, בלי טבלאות, בלי בלאגן ובלי סטרס.
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