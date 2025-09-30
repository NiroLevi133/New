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
  const [contactsSource, setContactsSource] = useState('file'); // 'file' or 'mobile'
  const [mobileContacts, setMobileContacts] = useState([]);
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
  const [showAddContact, setShowAddContact] = useState(false);
  const [manualPhone, setManualPhone] = useState('');
  const [searchInContacts, setSearchInContacts] = useState('');
  const [supportsMobileContacts, setSupportsMobileContacts] = useState(false);
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Auth
  const [phoneValue, setPhoneValue] = useState('');
  const [fullNameValue, setFullNameValue] = useState('');
  const [codeValue, setCodeValue] = useState('');
  const [showCodeInput, setShowCodeInput] = useState(false);

  // Check mobile contacts support
  useEffect(() => {
    checkMobileSupport();
  }, []);

  const checkMobileSupport = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/check-mobile-support`, {
        headers: {
          'User-Agent': navigator.userAgent
        }
      });
      const data = await response.json();
      setSupportsMobileContacts(data.supports_contacts_api);
    } catch (error) {
      console.error('Error checking mobile support:', error);
      setSupportsMobileContacts(false);
    }
  };

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
      
      if (type === 'contacts') {
        setContactsSource('file');
      }
      
      showMessage(`קובץ ${type === 'guests' ? 'מוזמנים' : 'אנשי קשר'} נטען בהצלחה`, 'success');
      
    } catch (error) {
      console.error(`Error uploading ${type}:`, error);
      showMessage(`שגיאה: ${error.message}`, 'error');
    }
  };

  // --- גישה לאנשי קשר במובייל ---
  const requestMobileContacts = async () => {
    if (!('contacts' in navigator) || !('ContactsManager' in window)) {
      showMessage('❌ הדפדפן לא תומך בגישה לאנשי קשר. השתמש בקובץ במקום.', 'error');
      return;
    }

    try {
      setIsLoading(true);
      showMessage('📱 מבקש גישה לאנשי קשר...', 'success');

      const contacts = await navigator.contacts.select(['name', 'tel'], { multiple: true });
      
      const formattedContacts = contacts.map(contact => ({
        name: contact.name?.[0] || 'ללא שם',
        phone: contact.tel?.[0] || ''
      })).filter(contact => contact.phone);

      setMobileContacts(formattedContacts);
      setContactsSource('mobile');
      setUploadedFiles(prev => ({ ...prev, contacts: 'mobile_contacts' }));
      
      showMessage(`✅ נטענו ${formattedContacts.length} אנשי קשר מהטלפון!`, 'success');
      
    } catch (error) {
      console.error('Error accessing contacts:', error);
      showMessage('❌ לא ניתן לגשת לאנשי קשר. בדוק הרשאות או השתמש בקובץ.', 'error');
    } finally {
      setIsLoading(false);
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
      formData.append('phone', currentUser.phone);
      formData.append('contacts_source', contactsSource);

      if (contactsSource === 'mobile') {
        const contactsBlob = new Blob([JSON.stringify(mobileContacts)], { type: 'application/json' });
        formData.append('contacts_file', contactsBlob, 'mobile_contacts.json');
      } else {
        formData.append('contacts_file', uploadedFiles.contacts);
      }

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
      
      const startIndex = data.start_index || 0;
      setCurrentGuestIndex(startIndex);

      const totalGuests = data.results.length;
      const remainingLimit = getRemainingDailyLimit();

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

  // --- התאמות ---
  const selectCandidate = (candidate) => {
    const currentGuest = matchingResults[currentGuestIndex];
    setSelectedContacts((prev) => ({
      ...prev,
      [currentGuest.guest]: candidate,
    }));
    setShowAddContact(false);
    setManualPhone('');
    setSearchInContacts('');
  };

  // הוספת מספר ידני
  const addManualContact = () => {
    if (!manualPhone.trim() || manualPhone.trim().length < 9) {
      showMessage('אנא הזן מספר טלפון תקין', 'error');
      return;
    }

    const newContact = {
      name: '📞 מספר שהוספת ידנית',
      phone: manualPhone.trim(),
      score: 100,
      reason: 'הוסף ידנית',
      isManual: true
    };

    selectCandidate(newContact);
    showMessage('✅ מספר נוסף בהצלחה!', 'success');
  };

    // חיפוש באנשי קשר עם השלמה אוטומטית
  const handleSearchInput = (value) => {
    setSearchInContacts(value);
    
    if (value.length < 2) {
      setSearchSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const searchTerm = value.toLowerCase();
    let contactsToSearch = [];

    // איסוף כל אנשי הקשר
    if (contactsSource === 'mobile') {
      contactsToSearch = mobileContacts;
    } else {
      const uniqueContacts = new Map();
      matchingResults.forEach(result => {
        if (result.candidates) {
          result.candidates.forEach(candidate => {
            const key = `${candidate.name}_${candidate.phone}`;
            if (!uniqueContacts.has(key)) {
              uniqueContacts.set(key, candidate);
            }
          });
        }
      });
      contactsToSearch = Array.from(uniqueContacts.values());
    }

    // סינון תוצאות
    const filtered = contactsToSearch
      .filter(contact => 
        contact.name.toLowerCase().includes(searchTerm) ||
        contact.phone.includes(value)
      )
      .slice(0, 5); // הגבל ל-5 תוצאות

    setSearchSuggestions(filtered);
    setShowSuggestions(filtered.length > 0);
  };

  const selectFromSuggestion = (contact) => {
    const selectedContact = {
      ...contact,
      reason: 'נמצא בחיפוש ידני'
    };
    selectCandidate(selectedContact);
    setSearchInContacts('');
    setShowSuggestions(false);
    setSearchSuggestions([]);
    showMessage(`✅ נבחר: ${contact.name}`, 'success');
  };

  const nextGuest = async () => {
    const remainingLimit = getRemainingDailyLimit();
    const processedCount = currentGuestIndex + 1;
    
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
      if (!currentUser.isPro && processedCount >= remainingLimit + currentUser.dailyMatchesUsed) {
        showMessage(`הגעת למגבלה היומית (${DAILY_LIMIT} התאמות). חזור מחר או שדרג לפרימיום!`, 'warning');
        setTimeout(() => showScreen('paymentScreen'), 2000);
        return;
      }
      
      setCurrentGuestIndex((prev) => prev + 1);
      
      if (!currentUser.isPro) {
        setCurrentUser(prev => ({
          ...prev,
          dailyMatchesUsed: Math.min(prev.dailyMatchesUsed + 1, DAILY_LIMIT)
        }));
      }
    } else {
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
          results: matchingResults.slice(0, currentGuestIndex + 1),
          selected_contacts: selectedContacts
        })
      });

      if (!response.ok) {
        throw new Error('שגיאה בייצוא הקובץ');
      }

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

  // --- פילטרים ---
  const getFilteredResults = () => {
    if (!matchingResults) return [];
    
    return matchingResults.filter(result => {
      const details = result.guest_details || {};
      
      if (filters.side) {
        const side = details['צד'] || details['side'] || '';
        if (!side.toLowerCase().includes(filters.side.toLowerCase())) {
          return false;
        }
      }
      
      if (filters.group) {
        const group = details['קבוצה'] || details['group'] || details['קטגוריה'] || '';
        if (!group.toLowerCase().includes(filters.group.toLowerCase())) {
          return false;
        }
      }
      
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

  // Helper function to get relevant guest details
  const getRelevantGuestDetails = (guestDetails) => {
  const relevantDetails = {};
  
  // חיפוש חכם - רק מידע שבאמת עוזר
  const sideKeys = ['צד', 'side', 'חתן', 'כלה', 'groom', 'bride'];
  for (const key of sideKeys) {
    if (guestDetails[key] && String(guestDetails[key]).trim()) {
      relevantDetails['צד'] = guestDetails[key];
      break;
    }
  }
  
  const groupKeys = ['קבוצה', 'group', 'קטגוריה', 'category', 'סוג', 'type', 'יחס', 'relation', 'משפחה', 'חברים'];
  for (const key of groupKeys) {
    if (guestDetails[key] && String(guestDetails[key]).trim()) {
      relevantDetails['קבוצה'] = guestDetails[key];
      break;
    }
  }
  
  const quantityKeys = ['כמות', 'quantity', 'מספר מוזמנים', 'אורחים', 'כמות מוזמנים'];
  for (const key of quantityKeys) {
    if (guestDetails[key] && String(guestDetails[key]).trim()) {
      relevantDetails['כמות מוזמנים'] = guestDetails[key];
      break;
    }
  }
  
  // החזר רק מה שבאמת מלא
  return Object.keys(relevantDetails).length > 0 ? relevantDetails : {};
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
          --success-green: #28a745;
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
          max-width: 1200px;
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

        .matching-layout {
          display: flex;
          gap: 20px;
          align-items: flex-start;
        }

        .main-content {
          flex: 1;
          min-width: 0;
        }

        .sidebar {
          width: 280px;
          background: var(--light-gray);
          border-radius: 15px;
          padding: 20px;
          border: 2px solid #e1e8ed;
          position: sticky;
          top: 20px;
          max-height: calc(90vh - 40px);
          overflow-y: auto;
        }

        .sidebar-section {
          margin-bottom: 25px;
        }

        .sidebar-title {
          font-size: 1.1rem;
          font-weight: 700;
          color: var(--dark-text);
          margin-bottom: 15px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .filter-item {
          margin-bottom: 15px;
        }

        .filter-item label {
          display: block;
          margin-bottom: 5px;
          color: var(--dark-text);
          font-weight: 600;
          font-size: 0.9rem;
        }

        .filter-item select, .filter-item input {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #ddd;
          border-radius: 8px;
          font-size: 0.9rem;
          box-sizing: border-box;
        }

        .filter-item select:focus, .filter-item input:focus {
          outline: none;
          border-color: var(--teal-green);
          box-shadow: 0 0 0 2px rgba(42, 157, 143, 0.1);
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

        .btn-small {
          padding: 8px 16px;
          font-size: 0.9rem;
          margin: 5px;
        }

        .btn-sidebar {
          width: 100%;
          padding: 12px 20px;
          margin: 8px 0;
          font-size: 0.95rem;
        }

        .btn-contacts {
          background: linear-gradient(135deg, #25D366, #128C7E);
          color: white;
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
        background: #f8f9fa;
        color: #333;
        border-radius: 15px;
        padding: 20px;
        margin-bottom: 25px;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
        border: 2px solid #e1e8ed;
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
          color: #333;
          margin-bottom: 15px;
          font-weight: 700;
          text-align: center;
        }

        .guest-progress {
          background: rgba(255, 255, 255, 0.2);
          padding: 8px 15px;
          border-radius: 20px;
          font-size: 0.9rem;
        }

        .guest-details {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          gap: 12px;
          margin-top: 15px;
        }

        .detail-item {
          background: white;
          padding: 12px 15px;
          border-radius: 10px;
          border: 1px solid #ddd;
          flex: 1;
          min-width: 120px;
          text-align: center;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}

        .detail-label {
          font-weight: 600;
          color: #666;
          font-size: 0.8rem;
          margin-bottom: 3px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .detail-value {
          color: #333;
          font-size: 0.95rem;
          font-weight: 600;
        }

        .candidate-card {
          background: var(--light-gray);
          border-radius: 10px;
          padding: 10px 12px;
          margin: 6px 0;
          border: 2px solid #e1e8ed;
          transition: all 0.3s ease;
          cursor: pointer;
          display: flex;
          justify-content: space-between;
          align-items: center;
          max-width: 500px;
          margin-left: auto;
          margin-right: auto;
        }

        .candidate-card:hover {
          border-color: var(--teal-green);
          transform: translateY(-2px);
          box-shadow: 0 4px 15px rgba(42, 157, 143, 0.2);
        }

        .candidate-card.selected {
          border-color: #00ff88;
          border-width: 3px;
          background: linear-gradient(135deg, rgba(0, 255, 136, 0.15), rgba(40, 167, 69, 0.15));
          box-shadow: 0 0 20px rgba(0, 255, 136, 0.6), 0 0 40px rgba(0, 255, 136, 0.3);
          transform: translateY(-2px) scale(1.02);
          animation: pulseGreen 2s infinite;
        }

        @keyframes pulseGreen {
          0%, 100% {
            box-shadow: 0 0 20px rgba(0, 255, 136, 0.6), 0 0 40px rgba(0, 255, 136, 0.3);
          }
          50% {
            box-shadow: 0 0 30px rgba(0, 255, 136, 0.8), 0 0 60px rgba(0, 255, 136, 0.5);
          }
        }

        .candidate-info {
          flex: 1;
        }

        .candidate-name {
          font-weight: 600;
          color: var(--dark-text);
          font-size: 0.95rem;
          margin-bottom: 2px;
        }

        .candidate-phone {
          font-size: 0.85rem;
          color: #666;
          direction: ltr;
          text-align: right;
        }

        .candidate-score {
          color: var(--teal-green);
          font-weight: 600;
          font-size: 0.9rem;
          min-width: 50px;
          text-align: center;
        }

        @keyframes pulseGreen {
          0%, 100% {
            box-shadow: 0 0 20px rgba(0, 255, 136, 0.6), 0 0 40px rgba(0, 255, 136, 0.3);
          }
          50% {
            box-shadow: 0 0 30px rgba(0, 255, 136, 0.8), 0 0 60px rgba(0, 255, 136, 0.5);
          }
        }

        .candidate-info {
          flex: 1;
        }

        .candidate-name {
          font-weight: 600;
          color: var(--dark-text);
          font-size: 0.95rem;
          margin-bottom: 2px;
        }

        .candidate-phone {
          font-size: 0.85rem;
          color: #666;
          direction: ltr;
          text-align: right;
        }

        .candidate-score {
          color: var(--teal-green);
          font-weight: 600;
          font-size: 0.9rem;
          min-width: 50px;
          text-align: center;
        }

        .add-contact-section {
          background: #fff3cd;
          border-radius: 12px;
          padding: 15px;
          margin: 15px 0;
          border: 2px solid #ffeaa7;
        }

        .add-contact-option {
          background: var(--light-gray);
          border-radius: 10px;
          padding: 12px;
          margin: 8px 0;
          border: 2px dashed #ccc;
          text-align: center;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .add-contact-option:hover {
          border-color: var(--teal-green);
          background: rgba(42, 157, 143, 0.05);
        }

        .add-contact-inputs {
          margin-top: 15px;
          padding-top: 15px;
          border-top: 1px solid #ddd;
        }

        .add-contact-inputs input {
          margin: 8px 0;
          padding: 10px 15px;
          font-size: 0.9rem;
        }

        .add-contact-buttons {
          display: flex;
          gap: 10px;
          justify-content: center;
          margin-top: 10px;
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

        @media (max-width: 1024px) {
          .matching-layout {
            flex-direction: column;
          }
          
          .sidebar {
            width: 100%;
            position: static;
            order: -1;
            max-height: none;
          }
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
                  <label>📞 אנשי קשר</label>
                  <button 
                    className="btn btn-guide" 
                    onClick={() => setShowContactsGuide(true)}
                    type="button"
                    style={{ padding: '8px 16px', fontSize: '0.8rem' }}
                  >
                    📋 איך להוציא אנשי קשר?
                  </button>
                </div>

                {/* אפשרות גישה למובייל */}
                {supportsMobileContacts && (
                  <div style={{ marginBottom: '15px' }}>
                    <button 
                      className="btn btn-contacts btn-small"
                      onClick={requestMobileContacts}
                      disabled={isLoading}
                      style={{ width: '100%' }}
                    >
                      📱 גישה לאנשי קשר בטלפון
                    </button>
                  </div>
                )}

                <div style={{ textAlign: 'center', margin: '10px 0', color: '#666' }}>
                  {supportsMobileContacts ? 'או' : ''}
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
                    ✅ {contactsSource === 'mobile' ? 
                        `אנשי קשר נטענו מהטלפון (${mobileContacts.length})` : 
                        'קובץ אנשי קשר נטען'}
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
  <div className="matching-layout">
    {/* סרגל צד עם פילטרים והורדה */}
    <div className="sidebar">
      <div className="sidebar-section">
        <div className="sidebar-title">📥 ייצוא</div>
        <button 
          className="btn btn-primary btn-sidebar"
          onClick={exportResults}
          disabled={isLoading || currentGuestIndex === 0}
          style={{ 
            padding: '10px 15px', 
            fontSize: '0.85rem',
            minHeight: 'auto'
          }}
        >
          {isLoading ? '⏳ מייצא...' : '📥 הורד'}
        </button>
              <div style={{ fontSize: '0.8rem', color: '#666', textAlign: 'center', marginTop: '8px' }}>
                {currentGuestIndex + 1} מוזמנים מעובדים
              </div>
            </div>

      <div className="sidebar-section">
        <div className="sidebar-title">🔍 פילטרים</div>
        
        {/* חיפוש - תמיד קיים */}
        <div className="filter-item">
          <label>חיפוש מוזמן:</label>
          <input 
            type="text" 
            placeholder="חפש שם..."
            value={filters.searchTerm}
            onChange={(e) => setFilters(prev => ({...prev, searchTerm: e.target.value}))}
          />
        </div>
        
        {/* פילטר צד - רק אם יש ערכים */}
        {getUniqueValues('צד').length > 0 && (
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
        )}
        
        {/* פילטר קבוצה - רק אם יש ערכים */}
        {getUniqueValues('קבוצה').length > 0 && (
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
        )}
      </div>

      {!currentUser.isPro && (
        <div className="sidebar-section">
          <div className="sidebar-title">💎 שדרוג</div>
          <div style={{ 
            background: 'linear-gradient(135deg, #667eea, #764ba2)', 
            color: 'white', 
            padding: '15px', 
            borderRadius: '10px',
            textAlign: 'center',
            fontSize: '0.9rem'
          }}>
            <div style={{ marginBottom: '10px' }}>
              <strong>{currentUser.dailyMatchesUsed}/{DAILY_LIMIT}</strong>
            </div>
            <div style={{ fontSize: '0.8rem', marginBottom: '15px' }}>
              שדרג לפרימיום ללא הגבלות!
            </div>
            <button 
              className="btn btn-primary btn-sidebar"
              onClick={() => showScreen('paymentScreen')}
              style={{ 
                background: 'rgba(255,255,255,0.2)', 
                border: '1px solid rgba(255,255,255,0.3)' 
              }}
            >
              💎 שדרג עכשיו
            </button>
          </div>
        </div>
      )}
    </div>

    <div className="main-content">
                <h2>🎯 התאמות שנמצאו</h2>

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
                      
                      {/* פרטים רלוונטיים על המוזמן */}
                      <div className="guest-details">
                        {(() => {
                          const relevantDetails = getRelevantGuestDetails(matchingResults[currentGuestIndex].guest_details || {});
                          return Object.entries(relevantDetails).map(([key, value]) => (
                            <div key={key} className="detail-item">
                              <div className="detail-label">{key}</div>
                              <div className="detail-value">{value}</div>
                            </div>
                          ));
                        })()}
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
                    
                    {/* 1️⃣ קודם - כל המועמדים */}
                    <div style={{ maxWidth: '600px', margin: '0 auto' }}>
                      {matchingResults[currentGuestIndex].candidates?.length > 0 ? (
                        matchingResults[currentGuestIndex].candidates.map((candidate, index) => (
                          <div 
                            key={index} 
                            className={`candidate-card ${
                              selectedContacts[matchingResults[currentGuestIndex].guest]?.name === candidate.name &&
                              selectedContacts[matchingResults[currentGuestIndex].guest]?.phone === candidate.phone ? 
                              'selected' : ''
                            }`}
                            onClick={() => selectCandidate(candidate)}
                            style={{
                              background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.1), rgba(118, 75, 162, 0.1))',
                              borderColor: selectedContacts[matchingResults[currentGuestIndex].guest]?.name === candidate.name &&
                                          selectedContacts[matchingResults[currentGuestIndex].guest]?.phone === candidate.phone ?
                                          '#00ff88' : 'var(--teal-green)'
                            }}
                          >
                            <div className="candidate-info">
                              <div className="candidate-name">{candidate.name}</div>
                              <div className="candidate-phone">{candidate.phone}</div>
                              {candidate.reason && (
                                <div style={{ fontSize: '0.75rem', color: '#888', marginTop: '3px' }}>
                                  {candidate.reason}
                                </div>
                              )}
                            </div>
                            <div className="candidate-score">
                              {candidate.score ? `${Math.round(candidate.score)}%` : ''}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="status-message status-warning">
                          ⚠️ לא נמצאו התאמות למוזמן זה
                        </div>
                      )}
                    </div>

                    {/* 2️⃣ אחר כך - כפתור הוספת איש קשר */}
                    <div style={{ maxWidth: '600px', margin: '20px auto' }}>
                      <button 
                        className="btn btn-secondary"
                        onClick={() => setShowAddContact(!showAddContact)}
                        style={{ 
                          width: '100%',
                          background: showAddContact ? '#e9ecef' : 'white',
                          borderColor: showAddContact ? 'var(--teal-green)' : '#e1e8ed',
                          padding: '12px 20px',
                          fontSize: '0.95rem'
                        }}
                      >
                        ➕ הוסף איש קשר אחר
                      </button>

                      {/* אפשרויות הוספה - רק כשפתוח */}
                      {showAddContact && (
                        <div style={{
                          background: '#f8f9fa',
                          borderRadius: '12px',
                          padding: '15px',
                          marginTop: '10px',
                          border: '2px solid #e1e8ed'
                        }}>
                          {/* שורה 1: חיפוש עם השלמה אוטומטית */}
                          <div style={{ 
                            display: 'flex', 
                            gap: '10px', 
                            marginBottom: '12px',
                            alignItems: 'center',
                            position: 'relative'
                          }}>
                            <div style={{ flex: 1, position: 'relative' }}>
                              <input
                                type="text"
                                placeholder="🔍 חפש שם באנשי קשר (2+ אותיות)..."
                                value={searchInContacts}
                                onChange={(e) => handleSearchInput(e.target.value)}
                                onFocus={() => {
                                  if (searchSuggestions.length > 0) setShowSuggestions(true);
                                }}
                                style={{ 
                                  width: '100%',
                                  padding: '10px 12px',
                                  border: '1px solid #ddd',
                                  borderRadius: '8px',
                                  fontSize: '0.9rem'
                                }}
                              />
                              
                              {/* רשימת הצעות */}
                              {showSuggestions && searchSuggestions.length > 0 && (
                                <div style={{
                                  position: 'absolute',
                                  top: '100%',
                                  left: 0,
                                  right: 0,
                                  background: 'white',
                                  border: '2px solid var(--teal-green)',
                                  borderRadius: '8px',
                                  marginTop: '5px',
                                  maxHeight: '200px',
                                  overflowY: 'auto',
                                  zIndex: 1000,
                                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                                }}>
                                  {searchSuggestions.map((contact, index) => (
                                    <div
                                      key={index}
                                      onClick={() => selectFromSuggestion(contact)}
                                      style={{
                                        padding: '10px 12px',
                                        cursor: 'pointer',
                                        borderBottom: index < searchSuggestions.length - 1 ? '1px solid #eee' : 'none',
                                        transition: 'background 0.2s ease'
                                      }}
                                      onMouseEnter={(e) => e.currentTarget.style.background = '#f0f4ff'}
                                      onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                                    >
                                      <div style={{ fontWeight: '600', color: '#333', marginBottom: '3px' }}>
                                        {contact.name}
                                      </div>
                                      <div style={{ fontSize: '0.85rem', color: '#666', direction: 'ltr', textAlign: 'right' }}>
                                        {contact.phone}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                          
                          {/* קו מפריד */}
                          <div style={{ 
                            borderTop: '1px solid #ddd',
                            margin: '12px 0',
                            position: 'relative'
                          }}>
                            <span style={{
                              position: 'absolute',
                              top: '-10px',
                              left: '50%',
                              transform: 'translateX(-50%)',
                              background: '#f8f9fa',
                              padding: '0 10px',
                              color: '#999',
                              fontSize: '0.8rem'
                            }}>או</span>
                          </div>
                          
                          {/* שורה 2: הוספה ידנית */}
                          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <input
                              type="tel"
                              placeholder="📞 הוסף מספר: 05X-XXXXXXX"
                              value={manualPhone}
                              onChange={(e) => setManualPhone(e.target.value)}
                              style={{ 
                                flex: 1,
                                padding: '10px 12px',
                                border: '1px solid #ddd',
                                borderRadius: '8px',
                                fontSize: '0.9rem',
                                direction: 'ltr',
                                textAlign: 'center'
                              }}
                              onKeyPress={(e) => {
                                if (e.key === 'Enter' && manualPhone.trim()) {
                                  addManualContact();
                                }
                              }}
                            />
                            <button 
                              className="btn btn-primary btn-small"
                              onClick={addManualContact}
                              disabled={!manualPhone.trim()}
                              style={{ minWidth: '80px' }}
                            >
                              הוסף
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 3️⃣ בסוף - כפתור "בחר אחר כך" */}
                    <div style={{ maxWidth: '600px', margin: '15px auto' }}>
                      <div 
                        className={`candidate-card ${
                          selectedContacts[matchingResults[currentGuestIndex].guest]?.isNotFound ? 'selected' : ''
                        }`}
                        style={{ 
                          border: '2px dashed #ccc',
                          background: selectedContacts[matchingResults[currentGuestIndex].guest]?.isNotFound ? 
                                      'rgba(255, 193, 7, 0.1)' : '#fafafa',
                          borderColor: selectedContacts[matchingResults[currentGuestIndex].guest]?.isNotFound ? 
                                      '#ffc107' : '#ccc'
                        }}
                        onClick={() => selectCandidate({ 
                          name: 'לא נמצא', 
                          phone: '', 
                          score: 0, 
                          reason: 'לא נמצא',
                          isNotFound: true 
                        })}
                      >
                        <div className="candidate-info">
                          <div className="candidate-name">⏭️ בחר אחר כך / לא מצאתי תוצאה</div>
                          <div className="candidate-phone" style={{ color: '#999' }}>
                            המוזמן יישאר ללא מספר טלפון בינתיים
                          </div>
                        </div>
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