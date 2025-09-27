import React, { useState, useEffect } from 'react';

const ChatunoTech = () => {
  // Constants
  const API_BASE_URL = 'https://new-569016630628.europe-west1.run.app';
  
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
  const [parsedData, setParsedData] = useState({
    guests: [],
    contacts: [],
  });
  const [matchingResults, setMatchingResults] = useState([]);
  const [currentGuestIndex, setCurrentGuestIndex] = useState(0);
  const [selectedContacts, setSelectedContacts] = useState({});
  const [message, setMessage] = useState({ text: '', type: '' });
  const [showContactsGuide, setShowContactsGuide] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Auth
  const [phoneValue, setPhoneValue] = useState('');
  const [codeValue, setCodeValue] = useState('');
  const [showCodeInput, setShowCodeInput] = useState(false);

  // Navigation
  const showScreen = (screenId) => setCurrentScreen(screenId);
  const goToLanding = () => showScreen('landingPage');
  const startAuth = () => showScreen('authScreen');

  // --- פונקציות אימות ---
  const sendCode = async () => {
    console.log('sendCode called with:', phoneValue);
    
    if (!phoneValue || phoneValue.length < 10) {
      showMessage('אנא הזן מספר טלפון תקין', 'error');
      return;
    }

    try {
      setIsLoading(true);
      showMessage('📱 שולח קוד...', 'success');
      
      const response = await fetch(`${API_BASE_URL}/send-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ phone: phoneValue })
      });

      if (response.ok) {
        const data = await response.json();
        showMessage('📱 קוד נשלח בהצלחה לווטסאפ!', 'success');
        setShowCodeInput(true);
        setCurrentUser((prev) => ({ ...prev, phone: phoneValue }));
        
        // Debug - אפשר להסיר בפרודקשן
        console.log('Sent code:', data.code);
      } else {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'שגיאה בשליחת הקוד');
      }
    } catch (error) {
      console.error('Send code error:', error);
      showMessage(`❌ שגיאה בשליחת הקוד: ${error.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const verifyCode = async () => {
    console.log('verifyCode called with:', codeValue);
    
    if (!codeValue || codeValue.length !== 4) {
      showMessage('אנא הזן קוד בן 4 ספרות', 'error');
      return;
    }

    try {
      setIsLoading(true);
      showMessage('🔐 מאמת קוד...', 'success');
      
      const response = await fetch(`${API_BASE_URL}/verify-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          phone: phoneValue, 
          code: codeValue 
        })
      });

      if (response.ok) {
        const data = await response.json();
        
        if (data.status === 'success') {
          // שמירה בגוגל שיטס
          await logUserToGoogleSheets(phoneValue);
          
          // עדכון משתמש
          setCurrentUser((prev) => ({ 
            ...prev, 
            usedGuests: data.used_guests || 0,
            isPro: data.is_premium || false
          }));

          showMessage('✅ אומת בהצלחה!', 'success');
          
          setTimeout(() => {
            const usedGuests = data.used_guests || 0;
            if (usedGuests >= 30 && !data.is_premium) {
              showMessage(`השתמשת בכל המוזמנים החינמיים (${usedGuests}/30). זמן לשדרג!`, 'warning');
              setTimeout(() => setCurrentScreen('paymentScreen'), 2000);
            } else {
              const remaining = 30 - usedGuests;
              showMessage(`נותרו לך ${remaining} מוזמנים חינמיים`, 'success');
              setTimeout(() => setCurrentScreen('uploadScreen'), 2000);
            }
          }, 1000);
        } else {
          showMessage('❌ קוד שגוי. נסה שוב.', 'error');
        }
      } else {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'שגיאה באימות הקוד');
      }
    } catch (error) {
      console.error('Verify code error:', error);
      showMessage(`❌ שגיאה באימות הקוד: ${error.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const logUserToGoogleSheets = async (phone) => {
    try {
      await fetch(`${API_BASE_URL}/log-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ phone })
      });
    } catch (error) {
      console.error('Error logging user:', error);
    }
  };

  // --- פונקציות עיבוד קבצים ---
  const handleFileUpload = async (event, type) => {
  const file = event.target.files[0];
  if (!file) return;

  try {
    showMessage(`טוען קובץ ${type === 'guests' ? 'מוזמנים' : 'אנשי קשר'}...`, 'success');
    
    // פשוט שמור את הקובץ, אל תנסה לקרוא אותו
    setUploadedFiles(prev => ({
      ...prev,
      [type]: file
    }));
    
    showMessage(`קובץ ${type === 'guests' ? 'מוזמנים' : 'אנשי קשר'} נטען בהצלחה`, 'success');
    
  } catch (error) {
    console.error(`Error uploading ${type}:`, error);
    showMessage(`שגיאה: ${error.message}`, 'error');
  }
};





  // --- מיזוג באמצעות Backend ---
  const startMerge = async () => {
    if (!uploadedFiles.guests || !uploadedFiles.contacts) {
      showMessage('אנא וודא שהקבצים הועלו בהצלחה', 'error');
      return;
    }
    
    showScreen('loadingScreen');
    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append('guests_file', uploadedFiles.guests);
      formData.append('contacts_file', uploadedFiles.contacts);

      const response = await fetch(`${API_BASE_URL}/merge-files`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'שגיאה בעיבוד הקבצים');
      }

      const data = await response.json();
      setMatchingResults(data.results);
      setCurrentGuestIndex(0);

      const totalGuests = data.results.length;

      if (totalGuests > 30 && !currentUser.isPro && currentUser.usedGuests === 0) {
        showMessage(
          `יש לך ${totalGuests} מוזמנים, אבל המגבלה החינמית היא 30. בואו נשדרג!`,
          'warning'
        );
        setTimeout(() => showScreen('paymentScreen'), 3000);
      } else {
        showScreen('matchingScreen');
      }
    } catch (error) {
      console.error('Error in merge:', error);
      showMessage(`שגיאה במיזוג: ${error.message}`, 'error');
      showScreen('uploadScreen');
    } finally {
      setIsLoading(false);
    }
  };

  // --- תשלום ---
  const payWithWhatsApp = () => {
    showMessage('מפנה לוואטסאפ לתשלום...', 'success');
    
    const message = `שלום! אני רוצה לשדרג לגרסה המלאה (39 ש״ח)
📱 מספר טלפון: ${currentUser.phone}
📊 כמות מוזמנים: ${matchingResults.length}
🔍 ID בקשה: ${Date.now()}
    
אנא שלח לי קישור לביט לתשלום. תודה!`;
    
    const whatsappURL = `https://wa.me/972508794079?text=${encodeURIComponent(message)}`;
    window.open(whatsappURL, '_blank');
    
    checkPaymentStatus();
  };

  const checkPaymentStatus = () => {
    showMessage('🔄 בודק סטטוס תשלום...', 'success');
    
    const checkInterval = setInterval(async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/check-payment-status/${currentUser.phone}`);
        
        if (response.ok) {
          const data = await response.json();
          
          if (data.is_premium) {
            clearInterval(checkInterval);
            setCurrentUser((prev) => ({ ...prev, isPro: true }));
            showMessage('🎉 תשלום הושלם בהצלחה! אתה עכשיו Pro!', 'success');
            setTimeout(() => showScreen('matchingScreen'), 2000);
          }
        }
      } catch (error) {
        console.error('Error checking payment status:', error);
      }
    }, 5000);

    setTimeout(() => {
      clearInterval(checkInterval);
    }, 300000);
  };

  const continueFree = () => {
    showMessage('אוקיי, נמשיך עם המגבלה החינמית (30 מוזמנים)', 'warning');
    
    const limitedResults = matchingResults.slice(0, 30);
    setMatchingResults(limitedResults);
    
    setTimeout(() => showScreen('matchingScreen'), 1500);
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
      [currentGuest.guest]: candidate,
    }));
  };

  const nextGuest = () => {
    if (currentGuestIndex < matchingResults.length - 1) {
      setCurrentGuestIndex((prev) => prev + 1);
    } else {
      // Save final results
      console.log('Final selections:', selectedContacts);
      showScreen('successScreen');
    }
  };

  const previousGuest = () => {
    if (currentGuestIndex > 0) {
      setCurrentGuestIndex((prev) => prev - 1);
    }
  };

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
          --light-gray: #f8f9fa;
        }

        .app-container {
          min-height: 100vh;
          width: 100vw;
          position: fixed;
          top: 0;
          left: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 20px;
          background: linear-gradient(135deg, var(--teal-green), var(--orange-gold));
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          direction: rtl;
          overflow-y: auto;
          box-sizing: border-box;
        }

        .content-card {
          background: var(--white);
          border-radius: 25px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.15);
          padding: 40px;
          width: 100%;
          max-width: 600px;
          min-width: 320px;
          position: relative;
          overflow: hidden;
          margin: auto;
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
          text-decoration: none;
          display: inline-block;
          opacity: 1;
        }

        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none !important;
        }

        .btn-primary {
          background: linear-gradient(135deg, var(--orange-red), var(--orange-gold));
          color: var(--white);
          box-shadow: 0 8px 25px rgba(231, 111, 81, 0.4);
        }

        .btn-primary:hover:not(:disabled) {
          transform: translateY(-3px);
          box-shadow: 0 12px 35px rgba(231, 111, 81, 0.5);
        }

        .btn-secondary {
          background: var(--white);
          color: var(--teal-green);
          border: 2px solid var(--teal-green);
          box-shadow: 0 5px 15px rgba(42, 157, 143, 0.2);
        }

        .btn-guide {
          background: var(--light-gray);
          color: var(--dark-text);
          border: 2px solid #ddd;
          font-size: 0.9rem;
          padding: 10px 20px;
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

        .candidate-card {
          background: var(--light-gray);
          border-radius: 12px;
          padding: 15px;
          margin: 10px 0;
          border: 2px solid #e1e8ed;
          transition: all 0.3s ease;
        }

        .candidate-card:hover {
          border-color: var(--teal-green);
          transform: translateY(-2px);
          box-shadow: 0 5px 15px rgba(0,0,0,0.1);
        }

        .score-badge {
          display: inline-block;
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 0.8rem;
          font-weight: bold;
          margin-left: 10px;
        }

        .score-high {
          background: rgba(42, 157, 143, 0.2);
          color: var(--teal-green);
        }

        .score-medium {
          background: rgba(233, 196, 106, 0.2);
          color: #d68910;
        }

        .score-low {
          background: rgba(231, 111, 81, 0.2);
          color: var(--orange-red);
        }

        .loading-spinner {
          width: 40px;
          height: 40px;
          border: 4px solid #f3f3f3;
          border-top: 4px solid var(--teal-green);
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 20px auto;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .popup-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          animation: fadeIn 0.3s ease;
        }

        .popup-content {
          background: var(--white);
          border-radius: 20px;
          padding: 30px;
          max-width: 500px;
          width: 90%;
          max-height: 80vh;
          overflow-y: auto;
          position: relative;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          animation: slideIn 0.3s ease;
        }

        .popup-close {
          position: absolute;
          top: 10px;
          left: 15px;
          background: none;
          border: none;
          font-size: 24px;
          cursor: pointer;
          color: #666;
          width: 30px;
          height: 30px;
        }

        .popup-close:hover {
          color: var(--orange-red);
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes slideIn {
          from { transform: translateY(-50px) scale(0.9); opacity: 0; }
          to { transform: translateY(0) scale(1); opacity: 1; }
        }

        .guide-container {
          background: var(--light-gray);
          border-radius: 15px;
          padding: 25px;
          margin: 20px 0;
          border: 2px solid #e1e8ed;
        }

        .guide-steps {
          list-style: none;
          padding: 0;
          counter-reset: step-counter;
        }

        .guide-step {
          counter-increment: step-counter;
          position: relative;
          padding: 15px 0 15px 60px;
          border-right: 3px solid var(--teal-green);
          margin-bottom: 15px;
          padding-right: 15px;
        }

        .guide-step::before {
          content: counter(step-counter);
          position: absolute;
          right: -15px;
          top: 15px;
          background: var(--teal-green);
          color: white;
          width: 30px;
          height: 30px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          font-size: 0.9rem;
        }

        .guide-step:last-child {
          border-right: none;
        }

        .chrome-link {
          color: var(--orange-red);
          text-decoration: none;
          font-weight: bold;
        }

        .chrome-link:hover {
          text-decoration: underline;
        }
      `}</style>
    
      <div className="app-container">
        <div className="content-card">
          {/* --- דף נחיתה --- */}
          {currentScreen === 'landingPage' && (
            <div style={{ textAlign: 'center' }}>
              <h2>🎯 מערכת התאמת מוזמנים חכמה</h2>
              <p>מערכת חכמה שמתאמת אוטומטית בין רשימת המוזמנים לרשימת אנשי הקשר שלך.</p>
              <div style={{ 
                background: 'linear-gradient(135deg, rgba(42, 157, 143, 0.1), rgba(244, 162, 97, 0.1))', 
                padding: '20px', 
                borderRadius: '15px', 
                margin: '20px 0' 
              }}>
                <h3>✨ מה המערכת עושה?</h3>
                <ul style={{ textAlign: 'right', listStyle: 'none', padding: 0 }}>
                  <li>📋 מעלה קובץ מוזמנים וקובץ אנשי קשר</li>
                  <li>🔍 מחפשת התאמות אוטומטיות בין השמות</li>
                  <li>📱 מוסיפה מספרי טלפון למוזמנים</li>
                  <li>⚡ חוסכת שעות של עבודה ידנית!</li>
                </ul>
              </div>
              <button className="btn btn-primary" onClick={startAuth}>
                🚀 בואו נתחיל!
              </button>
            </div>
          )}

          {/* --- מסך אימות --- */}
          {currentScreen === 'authScreen' && (
            <div className="auth-screen" style={{ textAlign: 'center' }}>
              <h2>🔐 אימות משתמש</h2>
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

              {showCodeInput && (
                <div>
                  <label>קוד אימות מווטסאפ</label>
                  <input
                    type="text"
                    placeholder="הזן קוד בן 4 ספרות"
                    value={codeValue}
                    onChange={(e) => setCodeValue(e.target.value)}
                    disabled={isLoading}
                  />
                </div>
              )}

              {isLoading && <div className="loading-spinner"></div>}

              <button
                className="btn btn-primary"
                onClick={() => {
                  if (showCodeInput) {
                    verifyCode();
                  } else {
                    sendCode();
                  }
                }}
                disabled={isLoading}
                type="button"
              >
                {isLoading ? '⏳ טוען...' : 
                 showCodeInput ? '✅ אמת קוד' : '📱 שלח קוד אימות'}
              </button>

              <div>
                <button className="btn btn-secondary" onClick={goToLanding} disabled={isLoading}>
                  ⬅️ חזרה
                </button>
              </div>
            </div>
          )}

          {/* --- מסך העלאת קבצים --- */}
          {currentScreen === 'uploadScreen' && (
            <div>
              <h2>📁 העלה את הקבצים שלך</h2>
              
              {/* קובץ אנשי קשר */}
              <div style={{ marginBottom: '30px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <label>📞 קובץ אנשי קשר (CSV/Excel)</label>
                  <button 
                    className="btn btn-guide" 
                    onClick={() => setShowContactsGuide(true)}
                    type="button"
                  >
                    📋 איך להוציא אנשי קשר?
                  </button>
                </div>

                <input 
                  type="file" 
                  accept=".csv,.xlsx,.xls"
                  onChange={(e) => handleFileUpload(e, 'contacts')}
                  style={{ marginBottom: '10px' }}
                  disabled={isLoading}
                />
                {parsedData.contacts.length > 0 && (
                  <div className="status-message status-success">
                    ✅ נטענו {parsedData.contacts.length} אנשי קשר
                  </div>
                )}
              </div>

              {/* קובץ מוזמנים */}
              <div style={{ marginBottom: '30px' }}>
                <label>👰 קובץ מוזמנים (CSV/Excel)</label>
                <input 
                  type="file" 
                  accept=".csv,.xlsx,.xls" 
                  onChange={(e) => handleFileUpload(e, 'guests')}
                  style={{ marginBottom: '10px' }}
                  disabled={isLoading}
                />
                {parsedData.guests.length > 0 && (
                  <div className="status-message status-success">
                    ✅ נטענו {parsedData.guests.length} מוזמנים
                  </div>
                )}
              </div>

              <button 
                className="btn btn-primary" 
                onClick={startMerge}
                disabled={!uploadedFiles.guests || !uploadedFiles.contacts || isLoading}
                style={{ width: '100%' }}
              >
                {isLoading ? '⏳ טוען...' : '🚀 התחל מיזוג'}
              </button>
            </div>
          )}

          {/* --- מסך טעינה --- */}
          {currentScreen === 'loadingScreen' && (
            <div style={{ textAlign: 'center' }}>
              <h2>⏳ מבצע מיזוג...</h2>
              <div className="loading-spinner"></div>
              <p>מנתח את הקבצים ומחפש התאמות...</p>
              <div style={{ 
                background: 'rgba(42, 157, 143, 0.1)', 
                padding: '15px', 
                borderRadius: '10px',
                margin: '20px 0'
              }}>
                💡 <strong>טיפ:</strong> התהליך יכול לקחת כמה רגעים, תלוי בגודל הקבצים
              </div>
            </div>
          )}

          {/* --- מסך התאמות --- */}
          {currentScreen === 'matchingScreen' && (
            <div>
              <h2>🎯 התאמות שנמצאו</h2>
              {matchingResults.length > 0 && (
                <div>
                  <div style={{ 
                    background: 'linear-gradient(135deg, var(--teal-green), var(--orange-gold))',
                    color: 'white',
                    padding: '15px',
                    borderRadius: '10px',
                    marginBottom: '20px',
                    textAlign: 'center'
                  }}>
                    <strong style={{ fontSize: '1.2rem' }}>
                      מוזמן {currentGuestIndex + 1} מתוך {matchingResults.length}
                    </strong>
                    <br />
                    <span style={{ fontSize: '1.1rem' }}>
                      {matchingResults[currentGuestIndex].guest}
                    </span>
                  </div>
                  
                  {matchingResults[currentGuestIndex].candidates?.length > 0 ? (
                    matchingResults[currentGuestIndex].candidates.map((candidate, index) => (
                      <div key={index} className="candidate-card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <strong>{candidate.name}</strong>
                            <br />
                            <small style={{ color: '#666' }}>📱 {candidate.phone}</small>
                            <br />
                            <small style={{ color: '#888' }}>{candidate.reason}</small>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span className={`score-badge ${
                              candidate.score >= 80 ? 'score-high' : 
                              candidate.score >= 60 ? 'score-medium' : 'score-low'
                            }`}>
                              {candidate.score}%
                            </span>
                            <button 
                              className="btn btn-secondary" 
                              onClick={() => selectCandidate(candidate)}
                              style={{ padding: '8px 16px', margin: '0' }}
                            >
                              ✅ בחר
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="status-message status-warning">
                      ⚠️ לא נמצאו התאמות למוזמן זה
                    </div>
                  )}
                  
                  <div style={{ marginTop: '30px', display: 'flex', justifyContent: 'space-between' }}>
                    <button 
                      className="btn btn-secondary" 
                      onClick={previousGuest}
                      disabled={currentGuestIndex === 0}
                    >
                      ⬅️ קודם
                    </button>
                    <button 
                      className="btn btn-primary" 
                      onClick={nextGuest}
                    >
                      {currentGuestIndex === matchingResults.length - 1 ? '✅ סיים' : '➡️ הבא'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* --- מסך תשלום --- */}
          {currentScreen === 'paymentScreen' && (
            <div style={{ textAlign: 'center' }}>
              <h2>🚀 שדרג לגרסה מלאה</h2>
              <div style={{ 
                background: 'linear-gradient(135deg, #667eea, #764ba2)', 
                color: 'white', 
                padding: '30px', 
                borderRadius: '20px', 
                marginBottom: '30px' 
              }}>
                <h3 style={{ margin: '0 0 15px 0', fontSize: '1.5rem' }}>💎 גרסה מלאה - רק ₪39</h3>
                <div style={{ fontSize: '1.1rem', marginBottom: '20px' }}>
                  ✅ ללא הגבלת מוזמנים<br/>
                  ✅ התאמות מושלמות<br/>
                  ✅ ייצוא לאקסל<br/>
                  ✅ תמיכה מלאה
                </div>
                <div style={{ 
                  background: 'rgba(255,255,255,0.2)', 
                  padding: '15px', 
                  borderRadius: '10px',
                  marginTop: '15px'
                }}>
                  <strong style={{ fontSize: '1.2rem' }}>
                    יש לך {matchingResults.length} מוזמנים
                  </strong>
                  <br/>
                  <small>מגבלה חינמית: 30 מוזמנים</small>
                </div>
              </div>
              
              <button 
                className="btn btn-primary" 
                onClick={payWithWhatsApp}
                style={{ 
                  width: '100%', 
                  padding: '20px',
                  fontSize: '1.3rem',
                  marginBottom: '15px',
                  background: 'linear-gradient(135deg, #25D366, #128C7E)'
                }}
              >
                💬 שלם דרך וואטסאפ - ₪39
              </button>
              
              <button 
                className="btn btn-secondary" 
                onClick={continueFree}
                style={{ width: '100%', padding: '15px' }}
              >
                📝 המשך חינם (30 מוזמנים ראשונים)
              </button>
              
              <div style={{ 
                marginTop: '20px', 
                fontSize: '0.9rem', 
                color: '#666',
                background: '#f8f9fa',
                padding: '15px',
                borderRadius: '10px'
              }}>
                💡 <strong>איך זה עובד?</strong><br/>
                1. לחץ על כפתור וואטסאפ<br/>
                2. נשלח לך קישור לביט<br/>
                3. שלם ₪39 חד-פעמי<br/>
                4. קבל גישה מיידית לכל המוזמנים!
              </div>
            </div>
          )}

          {/* --- מסך סיום --- */}
          {currentScreen === 'successScreen' && (
            <div style={{ textAlign: 'center' }}>
              <h2>🎉 כל המוזמנים עודכנו בהצלחה!</h2>
              <p>המערכת השלימה את תהליך ההתאמה</p>
              <div style={{ 
                background: 'var(--light-gray)',
                padding: '20px',
                borderRadius: '15px',
                marginTop: '30px'
              }}>
                <p><strong>📊 סיכום:</strong></p>
                <p>• {matchingResults.length} מוזמנים עובדו</p>
                <p>• {Object.keys(selectedContacts).length} התאמות נבחרו</p>
                <p>• {matchingResults.length - Object.keys(selectedContacts).length} מוזמנים ללא מספר</p>
              </div>
              <button className="btn btn-primary" onClick={() => window.location.reload()}>
                🔄 התחל מחדש
              </button>
            </div>
          )}

          {/* הודעות סטטוס */}
          {message.text && (
            <div className={`status-message status-${message.type}`}>
              {message.text}
            </div>
          )}

          {/* פופאפ מדריך אנשי קשר */}
          {showContactsGuide && (
            <div className="popup-overlay">
              <div className="popup-content">
                <button 
                  className="popup-close" 
                  onClick={() => setShowContactsGuide(false)}
                >
                  ✕
                </button>
                <h3>📱 איך להוציא אנשי קשר מהטלפון?</h3>
                
                <div className="guide-container">
                  <h4>📱 אנדרואיד:</h4>
                  <ol className="guide-steps">
                    <li className="guide-step">
                      פתח את אפליקציית <strong>אנשי קשר</strong>
                    </li>
                    <li className="guide-step">
                      לחץ על <strong>⋮</strong> (שלוש נקודות) ובחר <strong>ייצא</strong>
                    </li>
                    <li className="guide-step">
                      בחר <strong>ייצא ל-VCF</strong> או <strong>CSV</strong>
                    </li>
                    <li className="guide-step">
                      שמור את הקובץ ועלה אותו כאן
                    </li>
                  </ol>
                </div>

                <div className="guide-container">
                  <h4>🍎 iPhone:</h4>
                  <ol className="guide-steps">
                    <li className="guide-step">
                      פתח <strong>הגדרות</strong> → <strong>אנשי קשר</strong>
                    </li>
                    <li className="guide-step">
                      בחר <strong>ייצא אנשי קשר vCard</strong>
                    </li>
                    <li className="guide-step">
                      שלח לעצמך במייל ועלה כאן
                    </li>
                  </ol>
                </div>

                <div style={{ 
                  background: 'rgba(42, 157, 143, 0.1)', 
                  padding: '15px', 
                  borderRadius: '10px',
                  marginTop: '20px'
                }}>
                  💡 <strong>טיפ:</strong> אם יש לך בעיות, תוכל גם ליצור קובץ Excel פשוט עם עמודות "שם" ו"טלפון"
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatunoTech;