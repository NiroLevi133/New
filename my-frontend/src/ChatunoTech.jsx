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
  const [parsedData, setParsedData] = useState({
    guests: [],
    contacts: [],
  });
  const [matchingResults, setMatchingResults] = useState([]);
  const [currentGuestIndex, setCurrentGuestIndex] = useState(0);
  const [selectedContacts, setSelectedContacts] = useState({});
  const [message, setMessage] = useState({ text: '', type: '' });
  const [showContactsGuide, setShowContactsGuide] = useState(false);

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
    console.log('sendCode called with:', phoneValue); // Debug
    
    if (!phoneValue || phoneValue.length < 10) {
      showMessage('אנא הזן מספר טלפון תקין', 'error');
      return;
    }

    showMessage('📱 קוד נשלח בהצלחה!', 'success');
    setShowCodeInput(true);
    setCurrentUser((prev) => ({ ...prev, phone: phoneValue }));
  };

  const verifyCode = () => {
    console.log('verifyCode called with:', codeValue); // Debug
    
    if (!codeValue || codeValue.length !== 4) {
      showMessage('אנא הזן קוד בן 4 ספרות', 'error');
      return;
    }

    const usedGuests = Math.floor(Math.random() * 25);
    setCurrentUser((prev) => ({ ...prev, usedGuests }));

    // שליחה לDB - לא חוסמת
    logUserToDatabase(phoneValue).catch(err => console.log('DB log error:', err));

    showMessage('✅ אומת בהצלחה!', 'success');

    setTimeout(() => {
      if (usedGuests >= 30 && !currentUser.isPro) {
        showMessage(
          `השתמשת בכל המוזמנים החינמיים (${usedGuests}/30). זמן לשדרג!`,
          'warning'
        );
        setTimeout(() => setCurrentScreen('paymentScreen'), 2000);
      } else {
        const remaining = 30 - usedGuests;
        showMessage(`נותרו לך ${remaining} מוזמנים חינמיים`, 'success');
        setTimeout(() => setCurrentScreen('uploadScreen'), 2000);
      }
    }, 1000);
  };

  // --- פונקציות עיבוד קבצים ---
  const parseExcelContent = async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          // Simple Excel/CSV parsing
          const content = e.target.result;
          const lines = content.split('\n').filter(line => line.trim());
          
          if (lines.length < 2) {
            throw new Error('הקובץ לא מכיל מספיק נתונים');
          }
          
          // Parse headers - handle both comma and tab separators
          let separator = ',';
          if (lines[0].includes('\t')) separator = '\t';
          
          const headers = lines[0].split(separator).map(h => h.trim().replace(/"/g, ''));
          
          const data = lines.slice(1).map((line, index) => {
            const values = line.split(separator).map(v => v.trim().replace(/"/g, ''));
            const obj = { _rowIndex: index + 2 };
            
            headers.forEach((header, idx) => {
              obj[header] = values[idx] || '';
            });
            
            return obj;
          }).filter(obj => Object.values(obj).some(val => val && val.toString().trim()));
          
          resolve(data);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(new Error('שגיאה בקריאת הקובץ'));
      
      if (file.name.toLowerCase().includes('.xlsx') || file.name.toLowerCase().includes('.xls')) {
        reader.readAsText(file, 'UTF-8'); // Simple text reading for Excel files
      } else {
        reader.readAsText(file, 'UTF-8');
      }
    });
  };

  const parseCSVContent = (content, isContacts = false) => {
    try {
      const lines = content.split('\n').filter(line => line.trim());
      if (lines.length < 2) {
        throw new Error('הקובץ לא מכיל מספיק נתונים');
      }
      
      // Detect separator
      let separator = ',';
      if (lines[0].includes('\t')) separator = '\t';
      
      const headers = lines[0].split(separator).map(h => h.trim().replace(/"/g, ''));
      
      const data = lines.slice(1).map((line, index) => {
        const values = line.split(separator).map(v => v.trim().replace(/"/g, ''));
        const obj = { _rowIndex: index + 2 };
        
        headers.forEach((header, index) => {
          obj[header] = values[index] || '';
        });
        
        // נרמול השדות - מחפש בכל השמות האפשריים
        if (isContacts) {
          obj.normalizedName = obj.full_name || obj.Name || obj.name || obj['שם'] || obj['שם מלא'] || obj['Full Name'] || '';
          obj.normalizedPhone = obj.phone || obj.Phone || obj['טלפון'] || obj['מספר טלפון'] || obj['Phone'] || '';
        } else {
          obj.normalizedName = obj.full_name || obj.Name || obj.name || obj['שם'] || obj['שם מוזמן'] || obj['שם מלא'] || obj['Full Name'] || '';
        }
        
        return obj;
      }).filter(obj => obj.normalizedName && obj.normalizedName.trim());
      
      return data;
    } catch (error) {
      throw new Error(`שגיאה בפענוח הקובץ: ${error.message}`);
    }
  };

  const readFile = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error('שגיאה בקריאת הקובץ'));
      reader.readAsText(file, 'UTF-8');
    });
  };

  const handleFileUpload = async (file, type) => {
    try {
      showMessage(`טוען קובץ ${type === 'guests' ? 'מוזמנים' : 'אנשי קשר'}...`, 'success');
      
      let parsed = [];
      const isContacts = type === 'contacts';
      
      if (file.name.toLowerCase().includes('.xlsx') || file.name.toLowerCase().includes('.xls')) {
        parsed = await parseExcelContent(file);
      } else {
        const content = await readFile(file);
        parsed = parseCSVContent(content, isContacts);
      }
      
      // נרמול נתונים אחרי הפארסינג
      parsed = parsed.map(item => {
        if (isContacts) {
          item.normalizedName = item.full_name || item.Name || item.name || item['שם'] || item['שם מלא'] || item['Full Name'] || '';
          item.normalizedPhone = item.phone || item.Phone || item['טלפון'] || item['מספר טלפון'] || item['Phone'] || '';
        } else {
          item.normalizedName = item.full_name || item.Name || item.name || item['שם'] || item['שם מוזמן'] || item['שם מלא'] || item['Full Name'] || '';
        }
        return item;
      }).filter(item => item.normalizedName && item.normalizedName.trim());
      
      if (parsed.length === 0) {
        throw new Error('לא נמצאו נתונים תקינים בקובץ');
      }
      
      setParsedData(prev => ({
        ...prev,
        [type]: parsed
      }));
      
      setUploadedFiles(prev => ({
        ...prev,
        [type]: file
      }));
      
      const statusElement = document.getElementById(`${type}Status`);
      if (statusElement) {
        statusElement.innerHTML = `
          <div class="status-message status-success">
            ✅ קובץ ${type === 'guests' ? 'מוזמנים' : 'אנשי קשר'} הועלה בהצלחה!
            <br>נמצאו ${parsed.length} רשומות תקינות
          </div>
        `;
      }
      
      console.log(`${type} data sample:`, parsed.slice(0, 3));
      
      checkFilesReady();
      showMessage(`✅ קובץ ${type === 'guests' ? 'מוזמנים' : 'אנשי קשר'} נטען בהצלחה - ${parsed.length} רשומות`, 'success');
      
    } catch (error) {
      console.error(`Error uploading ${type}:`, error);
      showMessage(`שגיאה: ${error.message}`, 'error');
      
      const statusElement = document.getElementById(`${type}Status`);
      if (statusElement) {
        statusElement.innerHTML = `
          <div class="status-message status-error">
            ❌ שגיאה בטעינת הקובץ: ${error.message}
          </div>
        `;
      }
    }
  };

  // --- העלאת קבצים ---
  const setupFileUploads = () => {
    useEffect(() => {
      const guestsFile = document.getElementById('guestsFile');
      const contactsFile = document.getElementById('contactsFile');

      if (guestsFile) {
        guestsFile.addEventListener('change', function () {
          if (this.files[0]) {
            handleFileUpload(this.files[0], 'guests');
          }
        });
      }

      if (contactsFile) {
        contactsFile.addEventListener('change', function () {
          if (this.files[0]) {
            handleFileUpload(this.files[0], 'contacts');
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

  // --- אלגוריתם התאמה ---
  const calculateSimilarity = (str1, str2) => {
    if (!str1 || !str2) return 0;
    
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();
    
    if (s1 === s2) return 1.0;
    
    // חישוב דמיון על בסיס Levenshtein distance
    const matrix = [];
    const len1 = s1.length;
    const len2 = s2.length;
    
    for (let i = 0; i <= len2; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= len1; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= len2; i++) {
      for (let j = 1; j <= len1; j++) {
        if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    const distance = matrix[len2][len1];
    const maxLen = Math.max(len1, len2);
    return (maxLen - distance) / maxLen;
  };

  const findMatches = (guest, contacts) => {
    const candidates = contacts.map(contact => {
      const score = calculateSimilarity(guest.normalizedName, contact.normalizedName);
      let reason = '';
      
      if (score >= 0.9) reason = 'התאמה מלאה';
      else if (score >= 0.7) reason = 'דמיון גבוה';
      else if (score >= 0.5) reason = 'דמיון חלקי';
      else reason = 'דמיון נמוך';
      
      return {
        name: contact.normalizedName,
        phone: contact.normalizedPhone,
        score: score,
        reason: reason,
        originalData: contact
      };
    });
    
    return candidates
      .filter(c => c.score > 0.3)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  };

  const processMatching = () => {
    const results = parsedData.guests.map(guest => {
      const candidates = findMatches(guest, parsedData.contacts);
      return {
        name: guest.normalizedName,
        bestScore: candidates.length > 0 ? candidates[0].score : 0,
        candidates: candidates,
        originalData: guest
      };
    });
    
    return results.filter(r => r.candidates.length > 0);
  };

  // --- מיזוג ---
  const startMerge = () => {
    if (!parsedData.guests.length || !parsedData.contacts.length) {
      showMessage('אנא וודא שהקבצים הועלו בהצלחה', 'error');
      return;
    }
    
    showScreen('loadingScreen');

    setTimeout(() => {
      const results = processMatching();
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
  const payWithWhatsApp = () => {
    showMessage('מפנה לוואטסאפ לתשלום...', 'success');
    
    // הודעה עם פרטי המשתמש
    const message = `שלום! אני רוצה לשדרג לגרסה המלאה (39 ש״ח)
📱 מספר טלפון: ${currentUser.phone}
📊 כמות מוזמנים: ${matchingResults.length}
    
אנא שלח לי קישור לביט לתשלום. תודה!`;
    
    const whatsappURL = `https://wa.me/972508794079?text=${encodeURIComponent(message)}`;
    window.open(whatsappURL, '_blank');
  };

  const continueFree = () => {
    showMessage('אוקיי, נמשיך עם המגבלה החינמית (30 מוזמנים)', 'warning');
    
    // הראה רק 30 ראשונים
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

        .btn-guide {
          background: var(--light-gray);
          color: var(--dark-text);
          border: 2px solid #ddd;
          font-size: 0.9rem;
          padding: 10px 20px;
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

        .info-box {
          background: rgba(42, 157, 143, 0.1);
          border-right: 4px solid var(--teal-green);
          padding: 15px;
          margin: 15px 0;
          border-radius: 8px;
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
          z-index: 1000;
          animation: fadeIn 0.3s ease;
        }

        .popup-content {
          background: var(--white);
          border-radius: 20px;
          padding: 30px;
          max-width: 90vw;
          max-height: 80vh;
          overflow-y: auto;
          position: relative;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          animation: slideIn 0.3s ease;
        }

        .popup-close {
          position: absolute;
          top: 15px;
          left: 15px;
          background: none;
          border: none;
          font-size: 1.5rem;
          cursor: pointer;
          color: #666;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s ease;
        }

        .popup-close:hover {
          background: rgba(231, 111, 81, 0.1);
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

        h3 {
          color: var(--dark-text);
          font-size: 1.4rem;
          margin-bottom: 10px;
          font-weight: 600;
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

        #startMergeBtn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        /* פופאפ - סגנונות פשוטים וברורים */
        .popup-overlay {
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          width: 100vw !important;
          height: 100vh !important;
          background: rgba(0, 0, 0, 0.5) !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          z-index: 9999 !important;
        }

        .popup-content {
          background: white !important;
          border-radius: 20px !important;
          padding: 30px !important;
          max-width: 500px !important;
          width: 90% !important;
          max-height: 80vh !important;
          overflow-y: auto !important;
          position: relative !important;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3) !important;
        }

        .popup-close {
          position: absolute !important;
          top: 10px !important;
          left: 15px !important;
          background: none !important;
          border: none !important;
          font-size: 24px !important;
          cursor: pointer !important;
          color: #666 !important;
          width: 30px !important;
          height: 30px !important;
        }

        .popup-close:hover {
          color: #e76f51 !important;
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
                onClick={() => {
                  console.log('Button clicked, showCodeInput:', showCodeInput);
                  if (showCodeInput) {
                    verifyCode();
                  } else {
                    sendCode();
                  }
                }}
                type="button"
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
              
              {/* קובץ אנשי קשר - עכשיו ראשון */}
              <div style={{ marginBottom: '30px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <label>קובץ אנשי קשר (CSV/Excel)</label>
                  <button 
                    className="btn btn-guide" 
                    onClick={() => setShowContactsGuide(true)}
                    type="button"
                  >
                    📋 איך להוציא אנשי קשר?
                  </button>
                </div>

                <input 
                  id="contactsFile" 
                  type="file" 
                  accept=".csv,.xlsx,.xls"
                  style={{ marginBottom: '10px' }}
                />
                <div id="contactsStatus"></div>
              </div>

              {/* קובץ מוזמנים - עכשיו שני */}
              <div style={{ marginBottom: '30px' }}>
                <label>קובץ מוזמנים (CSV/Excel)</label>
                <input 
                  id="guestsFile" 
                  type="file" 
                  accept=".csv,.xlsx,.xls" 
                  style={{ marginBottom: '10px' }}
                />
                <div id="guestsStatus"></div>
              </div>

              <button 
                id="startMergeBtn" 
                className="btn btn-primary" 
                onClick={startMerge}
                disabled={true}
                style={{ opacity: 0.5, width: '100%' }}
              >
                🚀 התחל מיזוג
              </button>
            </div>
          )}

          {/* --- מסך טעינה --- */}
          {currentScreen === 'loadingScreen' && (
            <div style={{ textAlign: 'center' }}>
              <h2>⏳ מבצע מיזוג...</h2>
              <p>מנתח את הקבצים ומחפש התאמות...</p>
            </div>
          )}

          {/* --- מסך התאמות --- */}
          {currentScreen === 'matchingScreen' && (
            <div>
              <h2>התאמות שנמצאו</h2>
              {matchingResults.length > 0 && (
                <div>
                  <p style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>
                    מוזמן {currentGuestIndex + 1} מתוך {matchingResults.length}: {matchingResults[currentGuestIndex].name}
                  </p>
                  
                  {matchingResults[currentGuestIndex].candidates.map((candidate, index) => (
                    <div key={index} className="candidate-card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <strong>{candidate.name}</strong>
                          <br />
                          <small style={{ color: '#666' }}>{candidate.phone}</small>
                          <br />
                          <small style={{ color: '#888' }}>{candidate.reason}</small>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span className={`score-badge ${
                            candidate.score >= 0.8 ? 'score-high' : 
                            candidate.score >= 0.6 ? 'score-medium' : 'score-low'
                          }`}>
                            {Math.round(candidate.score * 100)}%
                          </span>
                          <button 
                            className="btn btn-secondary" 
                            onClick={() => selectCandidate(candidate)}
                            style={{ padding: '8px 16px', margin: '0' }}
                          >
                            בחר
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  
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
              <div style={{ marginTop: '30px' }}>
                <p><strong>סיכום:</strong></p>
                <p>• {matchingResults.length} מוזמנים עובדו</p>
                <p>• {Object.keys(selectedContacts).length} התאמות נבחרו</p>
              </div>
              <button className="btn btn-primary" onClick={() => window.location.reload()}>
                🔄 התחל מחדש
              </button>
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