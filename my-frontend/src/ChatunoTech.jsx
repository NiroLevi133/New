import React, { useState, useEffect } from 'react';

const ChatunoTech = () => {
  // State
  const [currentScreen, setCurrentScreen] = useState('landingPage');
  const [currentUser, setCurrentUser] = useState({
    phone: '',
    usedGuests: 0,
    isPro: false,
  });
  const [uploadedFiles, setUploadedFiles] = useState({
    guests: null,
    contacts: null,
  });
  const [matchingResults, setMatchingResults] = useState([]);
  const [currentGuestIndex, setCurrentGuestIndex] = useState(0);
  const [selectedContacts, setSelectedContacts] = useState({});
  const [message, setMessage] = useState({ text: '', type: '' });

  // Auth
  const [phoneValue, setPhoneValue] = useState('');
  const [codeValue, setCodeValue] = useState('');
  const [showCodeInput, setShowCodeInput] = useState(false);

  // Navigation
  const showScreen = (screenId) => setCurrentScreen(screenId);
  const goToLanding = () => showScreen('landingPage');
  const startAuth = () => showScreen('authScreen');

  // --- פונקציות אימות ---
  const sendCode = () => {
    if (!phoneValue || phoneValue.length < 10) {
      showMessage('אנא הזן מספר טלפון תקין', 'error');
      return;
    }

    showMessage('📱 קוד נשלח בהצלחה!', 'success');
    setShowCodeInput(true);
    setCurrentUser((prev) => ({ ...prev, phone: phoneValue }));
  };

  const verifyCode = () => {
    if (!codeValue || codeValue.length !== 4) {
      showMessage('אנא הזן קוד בן 4 ספרות', 'error');
      return;
    }

    const usedGuests = Math.floor(Math.random() * 25);
    setCurrentUser((prev) => ({ ...prev, usedGuests }));

    showMessage('✅ אומת בהצלחה!', 'success');

    setTimeout(() => {
      if (usedGuests >= 20 && !currentUser.isPro) {
        showMessage(
          `השתמשת בכל המוזמנים החינמיים (${usedGuests}/20). זמן לשדרג!`,
          'warning'
        );
        setTimeout(() => setCurrentScreen('paymentScreen'), 2000);
      } else {
        const remaining = 20 - usedGuests;
        showMessage(`נותרו לך ${remaining} מוזמנים חינמיים`, 'success');
        setTimeout(() => setCurrentScreen('uploadScreen'), 2000);
      }
    }, 1000);
  };

  // --- העלאת קבצים ---
  const setupFileUploads = () => {
    useEffect(() => {
      const guestsFile = document.getElementById('guestsFile');
      const contactsFile = document.getElementById('contactsFile');

      if (guestsFile) {
        guestsFile.addEventListener('change', function () {
          if (this.files[0]) {
            setUploadedFiles((prev) => ({ ...prev, guests: this.files[0] }));
            document.getElementById('guestsStatus').innerHTML =
              '<div class="status-message status-success">✅ קובץ מוזמנים הועלה</div>';
            checkFilesReady();
          }
        });
      }

      if (contactsFile) {
        contactsFile.addEventListener('change', function () {
          if (this.files[0]) {
            setUploadedFiles((prev) => ({ ...prev, contacts: this.files[0] }));
            document.getElementById('contactsStatus').innerHTML =
              '<div class="status-message status-success">✅ קובץ אנשי קשר הועלה</div>';
            checkFilesReady();
          }
        });
      }
    }, [currentScreen]);
  };

  const checkFilesReady = () => {
    const startBtn = document.getElementById('startMergeBtn');
    if (uploadedFiles.guests && uploadedFiles.contacts && startBtn) {
      startBtn.disabled = false;
      startBtn.style.opacity = '1';
    }
  };

  // --- נתוני דוגמה ---
  const generateSampleResults = () => {
    return [
      {
        name: 'שרה כהן',
        bestScore: 0.95,
        candidates: [
          { name: 'שרה כהן', phone: '050-1234567', score: 0.95, reason: 'התאמה מלאה' },
          { name: 'שרי כהן', phone: '052-9876543', score: 0.85, reason: 'דמיון גבוה' },
          { name: 'שרה לוי', phone: '053-5555555', score: 0.7, reason: 'התאמת שם פרטי' },
        ],
      },
      {
        name: 'דוד אברהם',
        bestScore: 0.88,
        candidates: [
          { name: 'דוד אברהם', phone: '054-1111111', score: 0.88, reason: 'התאמה טובה' },
          { name: 'דודי אברהם', phone: '055-2222222', score: 0.75, reason: 'כינוי' },
          { name: 'דוד אברמס', phone: '056-3333333', score: 0.65, reason: 'דמיון במשפחה' },
        ],
      },
    ];
  };

  // --- מיזוג ---
  const startMerge = () => {
    showScreen('loadingScreen');

    setTimeout(() => {
      const results = generateSampleResults();
      setMatchingResults(results);
      setCurrentGuestIndex(0);

      const totalGuests = results.length;

      if (totalGuests > 20 && !currentUser.isPro && currentUser.usedGuests === 0) {
        showMessage(
          `יש לך ${totalGuests} מוזמנים, אבל המגבלה החינמית היא 20. בואו נשדרג!`,
          'warning'
        );
        setTimeout(() => showScreen('paymentScreen'), 3000);
      } else {
        showScreen('matchingScreen');
      }
    }, 3000);
  };

  // --- תשלום ---
  const payWithBit = () => {
    showMessage('מפנה לתשלום Bit...', 'success');
    setTimeout(() => {
      setCurrentUser((prev) => ({ ...prev, isPro: true }));
      showMessage('🎉 תשלום הושלם בהצלחה! אתה עכשיו Pro!', 'success');
      setTimeout(() => showScreen('uploadScreen'), 2000);
    }, 2000);
  };

  const continueFree = () => {
    showMessage('אוקיי, נמשיך עם המגבלה החינמית', 'warning');
    setTimeout(() => showScreen('uploadScreen'), 1500);
  };

  // --- הודעות ---
  const showMessage = (text, type) => {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: '', type: '' }), 5000);
  };

  // --- התאמות ---
  const selectCandidate = (candidate) => {
    const currentGuest = matchingResults[currentGuestIndex];
    setSelectedContacts((prev) => ({
      ...prev,
      [currentGuest.name]: candidate,
    }));
  };

  const nextGuest = () => {
    if (currentGuestIndex < matchingResults.length - 1) {
      setCurrentGuestIndex((prev) => prev + 1);
    } else {
      showScreen('successScreen');
    }
  };

  const previousGuest = () => {
    if (currentGuestIndex > 0) {
      setCurrentGuestIndex((prev) => prev - 1);
    }
  };

  // Init
  setupFileUploads();

  // --- JSX ---
  return (
    <div>
      <style>{`
        :root {
          --orange-red: #e76f51;
          --orange-gold: #f4a261;
          --warm-yellow: #e9c46a;
          --teal-green: #2a9d8f;
          --dark-text: #264653;
          --white: #ffffff;
        }

        .app-container {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 20px;
          background: linear-gradient(135deg, var(--teal-green), var(--orange-gold));
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          direction: rtl;
        }

        .content-card {
          background: var(--white);
          border-radius: 25px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.15);
          padding: 40px;
          width: 100%;
          max-width: 600px;
          position: relative;
          overflow: hidden;
        }

        .content-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 5px;
          background: linear-gradient(90deg, var(--orange-red), var(--orange-gold), var(--warm-yellow), var(--teal-green));
        }

        .btn {
          padding: 15px 35px;
          border: none;
          border-radius: 50px;
          font-size: 1.1rem;
          cursor: pointer;
          font-weight: 700;
          margin: 10px;
          transition: all 0.3s ease;
        }

        .btn-primary {
          background: linear-gradient(135deg, var(--orange-red), var(--orange-gold));
          color: var(--white);
          box-shadow: 0 8px 25px rgba(231, 111, 81, 0.4);
        }

        .btn-primary:hover {
          transform: translateY(-3px);
          box-shadow: 0 12px 35px rgba(231, 111, 81, 0.5);
        }

        .btn-secondary {
          background: var(--white);
          color: var(--teal-green);
          border: 2px solid var(--teal-green);
          box-shadow: 0 5px 15px rgba(42, 157, 143, 0.2);
        }

        .status-message {
          padding: 15px 20px;
          border-radius: 12px;
          margin: 20px 0;
          font-weight: 600;
          text-align: center;
        }

        .status-success {
          background: rgba(42, 157, 143, 0.1);
          color: var(--teal-green);
          border: 2px solid rgba(42, 157, 143, 0.3);
        }

        .status-error {
          background: rgba(231, 111, 81, 0.1);
          color: var(--orange-red);
          border: 2px solid rgba(231, 111, 81, 0.3);
        }

        .status-warning {
          background: rgba(233, 196, 106, 0.1);
          color: #d68910;
          border: 2px solid rgba(233, 196, 106, 0.3);
        }

        input {
          width: 100%;
          padding: 15px 20px;
          border: 2px solid #e1e8ed;
          border-radius: 15px;
          font-size: 1.1rem;
          margin: 10px 0;
          text-align: center;
          box-sizing: border-box;
        }

        input:focus {
          outline: none;
          border-color: var(--teal-green);
          box-shadow: 0 0 0 3px rgba(42, 157, 143, 0.1);
        }

        h2 {
          color: var(--dark-text);
          font-size: 1.8rem;
          margin-bottom: 15px;
          font-weight: 700;
        }

        p {
          color: #666;
          margin-bottom: 20px;
        }

        label {
          display: block;
          margin-bottom: 10px;
          color: var(--dark-text);
          font-weight: 600;
          font-size: 1rem;
          text-align: right;
        }
      `}</style>
    
      <div className="app-container">
        <div className="content-card">
          {/* --- דף נחיתה --- */}
          {currentScreen === 'landingPage' && (
            <div style={{ textAlign: 'center' }}>
              <h2>המערכת שתחסוך לך שעות של עבודה!</h2>
              <p>מערכת חכמה שמתאמת אוטומטית בין רשימת המוזמנים לרשימת אנשי הקשר.</p>
              <button className="btn btn-primary" onClick={startAuth}>
                🚀 בואו נתחיל!
              </button>
            </div>
          )}

          {/* --- מסך אימות --- */}
          {currentScreen === 'authScreen' && (
            <div className="auth-screen" style={{ textAlign: 'center' }}>
              <h2>בואו נכיר!</h2>
              <p>הזן את מספר הטלפון שלך כדי להתחיל</p>

              <div>
                <label>מספר טלפון</label>
                <input
                  type="tel"
                  placeholder="05X-XXXXXXX"
                  value={phoneValue}
                  onChange={(e) => setPhoneValue(e.target.value)}
                />
              </div>

              {showCodeInput && (
                <div>
                  <label>קוד אימות מווצאפ</label>
                  <input
                    type="text"
                    placeholder="הזן קוד בן 4 ספרות"
                    value={codeValue}
                    onChange={(e) => setCodeValue(e.target.value)}
                  />
                </div>
              )}

              <button
                className="btn btn-primary"
                onClick={showCodeInput ? verifyCode : sendCode}
              >
                {showCodeInput ? '✅ אמת קוד' : '📱 שלח קוד אימות'}
              </button>

              <div>
                <button className="btn btn-secondary" onClick={goToLanding}>
                  ⬅️ חזרה
                </button>
              </div>
            </div>
          )}

          {/* --- מסך העלאת קבצים --- */}
          {currentScreen === 'uploadScreen' && (
            <div>
              <h2>העלה את הקבצים שלך</h2>
              <input id="guestsFile" type="file" />
              <div id="guestsStatus"></div>
              <input id="contactsFile" type="file" />
              <div id="contactsStatus"></div>
              <button id="startMergeBtn" onClick={startMerge}>
                🚀 התחל מיזוג
              </button>
            </div>
          )}

          {/* --- מסך טעינה --- */}
          {currentScreen === 'loadingScreen' && (
            <div style={{ textAlign: 'center' }}>
              <h2>⏳ מבצע מיזוג...</h2>
            </div>
          )}

          {/* --- מסך התאמות --- */}
          {currentScreen === 'matchingScreen' && (
            <div>
              <h2>התאמות שנמצאו</h2>
              {matchingResults.length > 0 && (
                <div>
                  <p>מוזמן: {matchingResults[currentGuestIndex].name}</p>
                  <ul>
                    {matchingResults[currentGuestIndex].candidates.map((c, i) => (
                      <li key={i}>
                        {c.name} - {c.phone} ({c.reason}){' '}
                        <button onClick={() => selectCandidate(c)}>בחר</button>
                      </li>
                    ))}
                  </ul>
                  <button onClick={previousGuest}>⬅️ קודם</button>
                  <button onClick={nextGuest}>➡️ הבא</button>
                </div>
              )}
            </div>
          )}

          {/* --- מסך תשלום --- */}
          {currentScreen === 'paymentScreen' && (
            <div style={{ textAlign: 'center' }}>
              <h2>🚀 שדרג לגרסה מלאה</h2>
              <button onClick={payWithBit}>שלם ב־Bit</button>
              <button onClick={continueFree}>המשך חינם</button>
            </div>
          )}

          {/* --- מסך סיום --- */}
          {currentScreen === 'successScreen' && (
            <div style={{ textAlign: 'center' }}>
              <h2>🎉 כל המוזמנים עודכנו בהצלחה!</h2>
            </div>
          )}

          {message.text && (
            <div className={`status-message status-${message.type}`}>
              {message.text}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatunoTech;
