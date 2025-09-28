import React, { useState, useEffect } from 'react';

const ChatunoTech = () => {
  // Constants
  const API_BASE_URL = 'https://new-569016630628.europe-west1.run.app';
  const DAILY_LIMIT = 30;
  
  // State
  const [currentScreen, setCurrentScreen] = useState('landingPage');
  const [currentUser, setCurrentUser] = useState({
    phone: '',
    fullName: '',
    dailyMatchesUsed: 0,
    isPro: false,
    currentFileHash: '',
    currentProgress: 0,
  });
  const [uploadedFiles, setUploadedFiles] = useState({
    guests: null,
    contacts: null,
  });
  const [matchingResults, setMatchingResults] = useState([]);
  const [currentGuestIndex, setCurrentGuestIndex] = useState(0);
  const [selectedContacts, setSelectedContacts] = useState({});
  const [message, setMessage] = useState({ text: '', type: '' });
  const [showContactsGuide, setShowContactsGuide] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [fileHash, setFileHash] = useState('');
  const [filters, setFilters] = useState({
    side: '',
    group: '',
    searchTerm: ''
  });

  // Auth
  const [phoneValue, setPhoneValue] = useState('');
  const [fullNameValue, setFullNameValue] = useState('');
  const [codeValue, setCodeValue] = useState('');
  const [showCodeInput, setShowCodeInput] = useState(false);

  // Navigation
  const showScreen = (screenId) => setCurrentScreen(screenId);
  const goToLanding = () => showScreen('landingPage');
  const startAuth = () => showScreen('authScreen');

  // --- פונקציות עזר ---
  const showMessage = (text, type) => {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: '', type: '' }), 5000);
  };

  const getRemainingDailyLimit = () => {
    return Math.max(0, DAILY_LIMIT - currentUser.dailyMatchesUsed);
  };

  const canProcessMoreGuests = () => {
    return currentUser.isPro || getRemainingDailyLimit() > 0;
  };

  // --- פונקציות אימות ---
  const sendCode = async () => {
    console.log('sendCode called with:', phoneValue, fullNameValue);
    
    if (!phoneValue || phoneValue.length < 10) {
      showMessage('אנא הזן מספר טלפון תקין', 'error');
      return;
    }

    if (!fullNameValue || fullNameValue.trim().length < 2) {
      showMessage('אנא הזן שם מלא', 'error');
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
        body: JSON.stringify({ 
          phone: phoneValue,
          full_name: fullNameValue 
        })
      });

      if (response.ok) {
        const data = await response.json();
        showMessage('📱 קוד נשלח בהצלחה לווטסאפ!', 'success');
        setShowCodeInput(true);
        setCurrentUser((prev) => ({ 
          ...prev, 
          phone: phoneValue,
          fullName: fullNameValue 
        }));
        
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
          code: codeValue,
          full_name: fullNameValue
        })
      });

      if (response.ok) {
        const data = await response.json();
        
        if (data.status === 'success') {
          // עדכון משתמש
          setCurrentUser((prev) => ({ 
            ...prev, 
            dailyMatchesUsed: data.daily_matches_used || 0,
            isPro: data.is_premium || false,
            currentFileHash: data.current_file_hash || '',
            currentProgress: data.current_progress || 0
          }));

          showMessage('✅ אומת בהצלחה!', 'success');
          
          setTimeout(() => {
            const remainingLimit = DAILY_LIMIT - (data.daily_matches_used || 0);
            if (remainingLimit <= 0 && !data.is_premium) {
              showMessage(`השתמשת בכל המגבלה היומית (${data.daily_matches_used}/${DAILY_LIMIT}). חזור מחר או שדרג לפרימיום!`, 'warning');
              setTimeout(() => setCurrentScreen('paymentScreen'), 2000);
            } else {
              if (!data.is_premium) {
                showMessage(`נותרו לך ${remainingLimit} התאמות היום`, 'success');
              }
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

  // --- פונקציות עיבוד קבצים ---
  const handleFileUpload = async (event, type) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      showMessage(`טוען קובץ ${type === 'guests' ? 'מוזמנים' : 'אנשי קשר'}...`, 'success');
      
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
      formData.append('phone', currentUser.phone);

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
      setFileHash(data.file_hash);
      
      // התחל מהמקום שעצר (אם המשיך מקובץ קיים)
      const startIndex = data.start_index || 0;
      setCurrentGuestIndex(startIndex);

      const totalGuests = data.results.length;
      const remainingLimit = getRemainingDailyLimit();

      // הצג התרעה על מגבלה אם צריך
      if (!currentUser.isPro) {
        if (totalGuests > remainingLimit) {
          showMessage(
            `יש לך ${totalGuests} מוזמנים, אבל נותרו לך רק ${remainingLimit} התאמות היום. תוכל לעבד ${remainingLimit} מוזמנים או לשדרג לפרימיום.`,
            'warning'
          );
        }
        
        if (remainingLimit <= 0) {
          setTimeout(() => showScreen('paymentScreen'), 3000);
          return;
        }
      }

      showScreen('matchingScreen');
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
👤 שם: ${currentUser.fullName}
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
    showMessage('אוקיי, נמשיך עם המגבלה היומית', 'warning');
    setTimeout(() => showScreen('matchingScreen'), 1500);
  };

  // --- התאמות ---
  const selectCandidate = (candidate) => {
    const currentGuest = matchingResults[currentGuestIndex];
    setSelectedContacts((prev) => ({
      ...prev,
      [currentGuest.guest]: candidate,
    }));
  };

  const nextGuest = async () => {
    const remainingLimit = getRemainingDailyLimit();
    const processedCount = currentGuestIndex + 1;
    
    // עדכן התקדמות במסד הנתונים
    if (currentUser.phone) {
      try {
        await fetch(`${API_BASE_URL}/update-match-count`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            phone: currentUser.phone,
            matches_used: currentUser.isPro ? 0 : Math.min(processedCount, currentUser.dailyMatchesUsed + 1),
            progress: processedCount
          })
        });
      } catch (error) {
        console.error('Error updating progress:', error);
      }
    }

    if (currentGuestIndex < matchingResults.length - 1) {
      // בדוק מגבלה יומית
      if (!currentUser.isPro && processedCount >= remainingLimit + currentUser.dailyMatchesUsed) {
        showMessage(`הגעת למגבלה היומית (${DAILY_LIMIT} התאמות). חזור מחר או שדרג לפרימיום!`, 'warning');
        setTimeout(() => showScreen('paymentScreen'), 2000);
        return;
      }
      
      setCurrentGuestIndex((prev) => prev + 1);
      
      // עדכן מונה השימושים המקומי
      if (!currentUser.isPro) {
        setCurrentUser(prev => ({
          ...prev,
          dailyMatchesUsed: Math.min(prev.dailyMatchesUsed + 1, DAILY_LIMIT)
        }));
      }
    } else {
      // סיום - הצג סיכום
      showScreen('successScreen');
    }
  };

  const previousGuest = () => {
    if (currentGuestIndex > 0) {
      setCurrentGuestIndex((prev) => prev - 1);
    }
  };

  // --- ייצוא לקובץ ---
  const exportResults = async () => {
    try {
      setIsLoading(true);
      showMessage('📄 מכין קובץ לייצוא...', 'success');

      const response = await fetch(`${API_BASE_URL}/export-results`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          results: matchingResults,
          selected_contacts: selectedContacts
        })
      });

      if (!response.ok) {
        throw new Error('שגיאה בייצוא הקובץ');
      }

      // הורד את הקובץ
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `guests_with_contacts_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      showMessage('✅ קובץ יוצא בהצלחה!', 'success');
    } catch (error) {
      console.error('Export error:', error);
      showMessage('❌ שגיאה בייצוא הקובץ', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // --- פילטרים ---
  const getFilteredResults = () => {
    if (!matchingResults) return [];
    
    return matchingResults.filter(result => {
      const details = result.guest_details || {};
      
      // פילטר לפי צד
      if (filters.side) {
        const side = details['צד'] || details['side'] || '';
        if (!side.toLowerCase().includes(filters.side.toLowerCase())) {
          return false;
        }
      }
      
      // פילטר לפי קבוצה
      if (filters.group) {
        const group = details['קבוצה'] || details['group'] || details['קטגוריה'] || '';
        if (!group.toLowerCase().includes(filters.group.toLowerCase())) {
          return false;
        }
      }
      
      // פילטר לפי חיפוש כללי
      if (filters.searchTerm) {
        const searchLower = filters.searchTerm.toLowerCase();
        const guestName = result.guest.toLowerCase();
        if (!guestName.includes(searchLower)) {
          return false;
        }
      }
      
      return true;
    });
  };

  const getUniqueValues = (field) => {
    const values = new Set();
    matchingResults.forEach(result => {
      const details = result.guest_details || {};
      const value = details[field] || details[field.toLowerCase()] || '';
      if (value && value.toString().trim()) {
        values.add(value.toString().trim());
      }
    });
    return Array.from(values);
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
          max-width: 800px;
          min-width: 320px;
          position: relative;
          overflow: hidden;
          margin: auto;
          max-height: 90vh;
          overflow-y: auto;
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

        .guest-card {
          background: linear-gradient(135deg, var(--teal-green), var(--orange-gold));
          color: white;
          border-radius: 20px;
          padding: 25px;
          margin-bottom: 25px;
          box-shadow: 0 8px 25px rgba(42, 157, 143, 0.3);
        }

        .guest-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          flex-wrap: wrap;
        }

        .guest-name {
          font-size: 1.4rem;
          font-weight: 700;
          margin: 0;
        }

        .guest-progress {
          background: rgba(255, 255, 255, 0.2);
          padding: 8px 15px;
          border-radius: 20px;
          font-size: 0.9rem;
        }

        .guest-details {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 15px;
          margin-top: 15px;
        }

        .detail-item {
          background: rgba(255, 255, 255, 0.15);
          padding: 12px;
          border-radius: 10px;
          text-align: center;
        }

        .detail-label {
          font-size: 0.8rem;
          opacity: 0.9;
          margin-bottom: 5px;
        }

        .detail-value {
          font-weight: 600;
          font-size: 0.95rem;
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

        .filters-container {
          background: var(--light-gray);
          border-radius: 15px;
          padding: 20px;
          margin: 20px 0;
          border: 2px solid #e1e8ed;
        }

        .filters-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 15px;
          margin-bottom: 15px;
        }

        .filter-item {
          display: flex;
          flex-direction: column;
        }

        .filter-item select, .filter-item input {
          margin: 5px 0 0 0;
          padding: 10px;
          border-radius: 8px;
          border: 1px solid #ddd;
        }

        .progress-indicator {
          background: rgba(255, 255, 255, 0.2);
          border-radius: 20px;
          padding: 10px 15px;
          text-align: center;
          margin-bottom: 20px;
          font-weight: 600;
        }

        .limit-warning {
          background: rgba(255, 193, 7, 0.1);
          border: 2px solid rgba(255, 193, 7, 0.3);
          color: #856404;
          padding: 15px;
          border-radius: 10px;
          margin: 15px 0;
          text-align: center;
          font-weight: 600;
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

        @media (max-width: 768px) {
          .content-card {
            padding: 20px;
            margin: 10px;
          }
          
          .guest-header {
            flex-direction: column;
            gap: 10px;
          }
          
          .guest-details {
            grid-template-columns: 1fr;
          }
          
          .filters-grid {
            grid-template-columns: 1fr;
          }
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
                  <li>🎁 30 התאמות חינם כל יום!</li>
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
              <p>הזן את הפרטים שלך כדי להתחיל</p>

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
              
              {/* הצגת מגבלה יומית */}
              {!currentUser.isPro && (
                <div className="limit-warning">
                  📊 מגבלה יומית: {currentUser.dailyMatchesUsed}/{DAILY_LIMIT} התאמות
                  <br />
                  💎 שדרג לפרימיום להתאמות ללא הגבלה!
                </div>
              )}
              
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
                {uploadedFiles.contacts && (
                  <div className="status-message status-success">
                    ✅ קובץ אנשי קשר נטען
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
                {uploadedFiles.guests && (
                  <div className="status-message status-success">
                    ✅ קובץ מוזמנים נטען
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
              
              {/* כפתורי הורדת דוגמאות */}
              <div style={{ marginTop: '20px', textAlign: 'center' }}>
                <p>💡 צריך עזרה? הורד קבצי דוגמה:</p>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button 
                    className="btn btn-secondary" 
                    onClick={() => window.open(`${API_BASE_URL}/download-guests-template`, '_blank')}
                    style={{ padding: '10px 20px' }}
                  >
                    📥 דוגמה - מוזמנים
                  </button>
                  <button 
                    className="btn btn-secondary" 
                    onClick={() => window.open(`${API_BASE_URL}/download-contacts-template`, '_blank')}
                    style={{ padding: '10px 20px' }}
                  >
                    📥 דוגמה - אנשי קשר
                  </button>
                </div>
              </div>
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2>🎯 התאמות שנמצאו</h2>
                <button 
                  className="btn btn-secondary" 
                  onClick={exportResults}
                  disabled={isLoading}
                  style={{ padding: '10px 20px', margin: '0' }}
                >
                  {isLoading ? '⏳ מייצא...' : '📥 ייצא לExcel'}
                </button>
              </div>

              {/* פילטרים */}
              <div className="filters-container">
                <h4>🔍 פילטרים</h4>
                <div className="filters-grid">
                  <div className="filter-item">
                    <label>צד:</label>
                    <select 
                      value={filters.side} 
                      onChange={(e) => setFilters(prev => ({...prev, side: e.target.value}))}
                    >
                      <option value="">כל הצדדים</option>
                      {getUniqueValues('צד').map(side => (
                        <option key={side} value={side}>{side}</option>
                      ))}
                    </select>
                  </div>
                  <div className="filter-item">
                    <label>קבוצה:</label>
                    <select 
                      value={filters.group} 
                      onChange={(e) => setFilters(prev => ({...prev, group: e.target.value}))}
                    >
                      <option value="">כל הקבוצות</option>
                      {getUniqueValues('קבוצה').map(group => (
                        <option key={group} value={group}>{group}</option>
                      ))}
                    </select>
                  </div>
                  <div className="filter-item">
                    <label>חיפוש:</label>
                    <input 
                      type="text" 
                      placeholder="חפש מוזמן..."
                      value={filters.searchTerm}
                      onChange={(e) => setFilters(prev => ({...prev, searchTerm: e.target.value}))}
                    />
                  </div>
                </div>
              </div>

              {matchingResults.length > 0 && (
                <div>
                  {/* פרטי מוזמן נוכחי */}
                  <div className="guest-card">
                    <div className="guest-header">
                      <h3 className="guest-name">
                        👰 {matchingResults[currentGuestIndex].guest}
                      </h3>
                      <div className="guest-progress">
                        מוזמן {currentGuestIndex + 1} מתוך {matchingResults.length}
                        {!currentUser.isPro && (
                          <span style={{ marginRight: '10px' }}>
                            • נותרו {getRemainingDailyLimit()} התאמות
                          </span>
                        )}
                      </div>
                    </div>
                    
                    {/* פרטים נוספים על המוזמן */}
                    <div className="guest-details">
                      {Object.entries(matchingResults[currentGuestIndex].guest_details || {}).map(([key, value]) => {
                        if (key === 'שם מלא' || key === 'norm_name' || !value) return null;
                        return (
                          <div key={key} className="detail-item">
                            <div className="detail-label">{key}</div>
                            <div className="detail-value">{value}</div>
                          </div>
                        );
                      })}
                      <div className="detail-item">
                        <div className="detail-label">ציון התאמה מקסימלי</div>
                        <div className="detail-value">
                          {matchingResults[currentGuestIndex].best_score}%
                        </div>
                      </div>
                      <div className="detail-item">
                        <div className="detail-label">מועמדים</div>
                        <div className="detail-value">
                          {matchingResults[currentGuestIndex].candidates?.length || 0}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* מועמדים */}
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
                  
                  {/* כפתור "לא נמצא" */}
                  <div className="candidate-card" style={{ border: '2px dashed #ccc' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong>❌ לא נמצא איש קשר מתאים</strong>
                        <br />
                        <small style={{ color: '#666' }}>המוזמן יישאר ללא מספר טלפון</small>
                      </div>
                      <button 
                        className="btn btn-secondary" 
                        onClick={() => selectCandidate({ 
                          name: 'לא נמצא', 
                          phone: '', 
                          score: 0, 
                          reason: 'לא נמצא',
                          isNotFound: true 
                        })}
                        style={{ padding: '8px 16px', margin: '0' }}
                      >
                        ✅ לא נמצא
                      </button>
                    </div>
                  </div>
                  
                  {/* כפתורי ניווט */}
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
                      disabled={!selectedContacts[matchingResults[currentGuestIndex].guest]}
                    >
                      {currentGuestIndex === matchingResults.length - 1 ? '✅ סיים' : '➡️ הבא'}
                    </button>
                  </div>

                  {/* בחירה נוכחית */}
                  {selectedContacts[matchingResults[currentGuestIndex].guest] && (
                    <div style={{ 
                      marginTop: '20px', 
                      padding: '15px', 
                      background: 'rgba(40, 167, 69, 0.1)', 
                      borderRadius: '10px',
                      border: '2px solid rgba(40, 167, 69, 0.2)'
                    }}>
                      <strong>✅ נבחר: </strong>
                      {selectedContacts[matchingResults[currentGuestIndex].guest].name}
                      {selectedContacts[matchingResults[currentGuestIndex].guest].phone && 
                        ` - ${selectedContacts[matchingResults[currentGuestIndex].guest].phone}`
                      }
                    </div>
                  )}
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
                  ✅ תמיכה מלאה<br/>
                  ✅ ללא מגבלה יומית
                </div>
                <div style={{ 
                  background: 'rgba(255,255,255,0.2)', 
                  padding: '15px', 
                  borderRadius: '10px',
                  marginTop: '15px'
                }}>
                  <strong style={{ fontSize: '1.2rem' }}>
                    השתמשת ב-{currentUser.dailyMatchesUsed}/{DAILY_LIMIT} התאמות היום
                  </strong>
                  <br/>
                  <small>מחר המונה יתאפס ותוכל להמשיך</small>
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
                onClick={() => showScreen('landingPage')}
                style={{ width: '100%', padding: '15px' }}
              >
                🏠 חזור לדף הבית
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
              
              <div style={{ marginTop: '20px' }}>
                <button 
                  className="btn btn-primary" 
                  onClick={exportResults}
                  disabled={isLoading}
                  style={{ marginRight: '10px' }}
                >
                  {isLoading ? '⏳ מייצא...' : '📥 ייצא תוצאות'}
                </button>
                <button className="btn btn-secondary" onClick={() => window.location.reload()}>
                  🔄 התחל מחדש
                </button>
              </div>
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
                <h3>📱 איך להוציא אנשי קשר?</h3>
                
                <div className="guide-container">
                  <h4>🌐 הדרך הקלה ביותר:</h4>
                  <ol className="guide-steps">
                    <li className="guide-step">
                      פתח דפדפן <strong>במחשב</strong> (לא בטלפון)
                    </li>
                    <li className="guide-step">
                      התקן את התוסף <strong>
                        <a href="https://chromewebstore.google.com/detail/joni/aakppiadmnaeffmjijolmgmkcfhpglbh" 
                           target="_blank" 
                           className="chrome-link">
                          ג'וני
                        </a>
                      </strong> בדפדפן Chrome
                    </li>
                    <li className="guide-step">
                      היכנס ל-<strong>WhatsApp Web</strong>
                    </li>
                    <li className="guide-step">
                      לחץ על סמל <strong>J</strong> בסרגל הכלים
                    </li>
                    <li className="guide-step">
                      בחר <strong>אנשי קשר</strong> → <strong>שמירה לקובץ Excel</strong>
                    </li>
                    <li className="guide-step">
                      הקובץ יורד אוטומטית למחשב
                    </li>
                  </ol>
                </div>

                <div style={{ 
                  background: 'rgba(42, 157, 143, 0.1)', 
                  padding: '15px', 
                  borderRadius: '10px',
                  marginTop: '20px'
                }}>
                  💡 <strong>חשוב:</strong> התוסף עובד רק בדפדפן Chrome במחשב
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