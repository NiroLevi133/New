import React, { useState, useEffect } from 'react';

const ChatunoTech = () => {
  // Constants
  const API_BASE_URL = 'https://new-569016630628.europe-west1.run.app';
  const DAILY_LIMIT = 30;
  const CHECKPOINT_INTERVAL = 10; // 🔥 שמירה כל 10
  
  // State
  const [currentScreen, setCurrentScreen] = useState('landingPage');
  const [currentUser, setCurrentUser] = useState({
    phone: '',
    fullName: '',
    dailyMatchesUsed: 0,
    isPro: false,
    currentFileHash: '',
    currentProgress: 0,
    resetTime: '', // 🔥 חדש
    remainingMatches: DAILY_LIMIT, // 🔥 חדש
  });
  const [uploadedFiles, setUploadedFiles] = useState({
    guests: null,
    contacts: null,
  });
  const [contactsSource, setContactsSource] = useState('file');
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
    group: ''
    // 🔥 הסרנו searchTerm!
  });
  const [showAddContact, setShowAddContact] = useState(false);
  const [manualPhone, setManualPhone] = useState('');
  const [searchInContacts, setSearchInContacts] = useState('');
  const [supportsMobileContacts, setSupportsMobileContacts] = useState(false);
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [allContactsData, setAllContactsData] = useState([]); // 🔥 חדש - לשמור את כל אנשי הקשר
  const [hasCheckpoint, setHasCheckpoint] = useState(false); // 🔥 חדש
  const [checkpointData, setCheckpointData] = useState(null); // 🔥 חדש

  // Auth - 🔥 משודרג
  const [phoneValue, setPhoneValue] = useState('');
  const [fullNameValue, setFullNameValue] = useState('');
  const [codeValue, setCodeValue] = useState('');
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [autoSelectedCount, setAutoSelectedCount] = useState(0);
  const [perfectMatchesCount, setPerfectMatchesCount] = useState(0); // 🔥 חדש

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

  // Helper functions
  const showMessage = (text, type) => {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: '', type: '' }), 5000);
  };

  const getRemainingDailyLimit = () => {
    return currentUser.remainingMatches || 0;
  };

  const canProcessMoreGuests = () => {
    return currentUser.isPro || getRemainingDailyLimit() > 0;
  };

  // 🔥 שמירת checkpoint כל 10 מוזמנים
  const saveCheckpointIfNeeded = async (index) => {
    if ((index + 1) % CHECKPOINT_INTERVAL === 0 && currentUser.phone && fileHash) {
      try {
        await fetch(`${API_BASE_URL}/save-checkpoint`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            phone: currentUser.phone,
            file_hash: fileHash,
            progress: index + 1,
            selections: selectedContacts
          })
        });
        showMessage('💾 התקדמות נשמרה', 'success');
      } catch (error) {
        console.error('Failed to save checkpoint:', error);
      }
    }
  };

  // 🔥 טעינת checkpoint
  const loadCheckpointIfExists = async () => {
    if (!currentUser.phone || !fileHash) return;
    
    try {
      const response = await fetch(`${API_BASE_URL}/load-checkpoint`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone: currentUser.phone,
          file_hash: fileHash
        })
      });
      
      const data = await response.json();
      
      if (data.status === 'found' && data.checkpoint) {
        setHasCheckpoint(true);
        setCheckpointData(data.checkpoint);
      }
    } catch (error) {
      console.error('Failed to load checkpoint:', error);
    }
  };

  // 🔥 שחזור מ-checkpoint
  const restoreFromCheckpoint = () => {
    if (checkpointData) {
      setCurrentGuestIndex(checkpointData.progress || 0);
      setSelectedContacts(checkpointData.selections || {});
      setHasCheckpoint(false);
      showMessage('✅ התקדמות שוחזרה', 'success');
    }
  };

  // Auth functions - 🔥 משודרגות
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
        setShowCodeInput(true); // 🔥 מעבר למצב הזנת קוד
        setCurrentUser((prev) => ({ 
          ...prev, 
          phone: phoneValue,
          fullName: fullNameValue 
        }));
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
        
        if (data.status === 'expired') {
          showMessage('⏰ הקוד פג תוקף. אנא שלח קוד חדש.', 'error');
          setShowCodeInput(false);
          setCodeValue('');
          return;
        }
        
        if (data.status === 'success') {
          setCurrentUser((prev) => ({ 
            ...prev, 
            dailyMatchesUsed: data.daily_matches_used || 0,
            isPro: data.is_premium || false,
            remainingMatches: data.remaining_matches || DAILY_LIMIT,
            resetTime: data.reset_time || ''
          }));

          showMessage('✅ אומת בהצלחה!', 'success');
          
          setTimeout(() => {
            const remaining = data.remaining_matches || 0;
            if (remaining <= 0 && !data.is_premium) {
              showMessage(
                `⏰ השתמשת בכל המגבלה היומית. המגבלה תתאפס בעוד ${data.reset_time}`,
                'warning'
              );
              setTimeout(() => setCurrentScreen('paymentScreen'), 2000);
            } else {
              if (!data.is_premium) {
                showMessage(`נותרו לך ${remaining} התאמות היום`, 'success');
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

  // 🔥 חזרה למסך טלפון (לשליחת קוד מחדש)
  const backToPhoneScreen = () => {
    setShowCodeInput(false);
    setCodeValue('');
    showMessage('ניתן לשלוח קוד חדש', 'info');
  };

  // File upload functions
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

  // Mobile contacts access
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
      setAllContactsData(formattedContacts); // 🔥 שמירה לחיפוש
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

// המשך מחלק 1...
  
  // 🔥 פונקציה לחילוץ כל אנשי הקשר מהקובץ (לא רק מועמדים)
  const extractAllContacts = (results) => {
    const allContacts = new Map();
    
    results.forEach(result => {
      if (result.candidates) {
        result.candidates.forEach(candidate => {
          const key = `${candidate.name}_${candidate.phone}`;
          if (!allContacts.has(key)) {
            allContacts.set(key, candidate);
          }
        });
      }
    });
    
    return Array.from(allContacts.values());
  };

  // Merge files
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

      // 🔥 בדיקת מגבלה
      if (response.status === 403) {
        const errorData = await response.json();
        if (errorData.error === 'daily_limit_exceeded') {
          showMessage(`⏰ ${errorData.message}. המגבלה תתאפס בעוד ${errorData.reset_time}`, 'warning');
          setTimeout(() => showScreen('paymentScreen'), 3000);
          return;
        }
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'שגיאה בעיבוד הקבצים');
      }

      const data = await response.json();
      setMatchingResults(data.results);
      setFileHash(data.file_hash);
      setAutoSelectedCount(data.auto_selected_count || 0);
      setPerfectMatchesCount(data.perfect_matches_count || 0); // 🔥 חדש
      
      // 🔥 שמירת כל אנשי הקשר לחיפוש
      const allContacts = extractAllContacts(data.results);
      setAllContactsData(allContacts);
      
      const startIndex = data.start_index || 0;
      setCurrentGuestIndex(startIndex);

      // 🔥 בחירה אוטומטית למוזמנים עם ציון >= 93%
      const autoSelections = {};
      data.results.forEach(result => {
        if (result.auto_selected) {
          autoSelections[result.guest] = result.auto_selected;
        }
      });
      setSelectedContacts(prev => ({ ...prev, ...autoSelections }));

      const totalGuests = data.results.length;

      // 🔥 אזהרה על הגבלה
      if (data.warning) {
        showMessage(`⚠️ ${data.warning}`, 'warning');
      }

      // 🔥 הודעה על התאמות מושלמות
      if (data.perfect_matches_count > 0) {
        showMessage(
          `🎯 מצאנו ${data.perfect_matches_count} התאמות מושלמות (100%)!`,
          'success'
        );
      }

      // 🔥 הודעה על בחירות אוטומטיות
      if (data.auto_selected_count > 0) {
        showMessage(
          `✅ ${data.auto_selected_count} מוזמנים נבחרו אוטומטית (93%+)!`,
          'success'
        );
      }

      // 🔥 טעינת checkpoint אם קיים
      setTimeout(() => loadCheckpointIfExists(), 500);

      showScreen('matchingScreen');
    } catch (error) {
      console.error('Error in merge:', error);
      showMessage(`שגיאה במיזוג: ${error.message}`, 'error');
      showScreen('uploadScreen');
    } finally {
      setIsLoading(false);
    }
  };

  // Select candidate
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

  // Add manual contact
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

  // 🔥 חיפוש באנשי קשר - משודרג! (מכל הקובץ)
  const handleSearchInput = (value) => {
    setSearchInContacts(value);
    
    if (value.length < 2) {
      setSearchSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const searchTerm = value.toLowerCase();
    
    // 🔥 חיפוש מכל אנשי הקשר (לא רק מועמדים!)
    let contactsToSearch = [];
    
    if (contactsSource === 'mobile') {
      contactsToSearch = mobileContacts;
    } else {
      contactsToSearch = allContactsData; // 🔥 כל הקובץ!
    }

    // סינון תוצאות
    const filtered = contactsToSearch
      .filter(contact => 
        contact.name.toLowerCase().includes(searchTerm) ||
        contact.phone.includes(value)
      )
      .slice(0, 5);

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

  // 🔥 פונקציית nextGuest משודרגת עם שמירה כל 10
  const nextGuest = async () => {
    const newIndex = currentGuestIndex + 1;
    
    // עדכון שימוש יומי
    if (currentUser.phone && !currentUser.isPro) {
      const newUsage = Math.min(currentUser.dailyMatchesUsed + 1, DAILY_LIMIT);
      setCurrentUser(prev => ({
        ...prev,
        dailyMatchesUsed: newUsage,
        remainingMatches: DAILY_LIMIT - newUsage
      }));
      
      try {
        await fetch(`${API_BASE_URL}/update-match-count`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            phone: currentUser.phone,
            matches_used: newUsage,
            progress: newIndex
          })
        });
      } catch (error) {
        console.error('Error updating progress:', error);
      }
    }

    // 🔥 שמירת checkpoint כל 10
    await saveCheckpointIfNeeded(newIndex - 1);

    // בדיקת מגבלה
    if (!currentUser.isPro && currentUser.dailyMatchesUsed >= DAILY_LIMIT) {
      showMessage(`הגעת למגבלה היומית (${DAILY_LIMIT} התאמות). חזור מחר או שדרג לפרימיום!`, 'warning');
      setTimeout(() => showScreen('paymentScreen'), 2000);
      return;
    }

    if (currentGuestIndex < matchingResults.length - 1) {
      setCurrentGuestIndex(newIndex);
      
      // 🔥 הודעה כשנותרו מעט התאמות
      if (!currentUser.isPro) {
        const remaining = DAILY_LIMIT - currentUser.dailyMatchesUsed - 1;
        if (remaining === 5) {
          showMessage('⚠️ נותרו רק 5 התאמות היום!', 'warning');
        } else if (remaining === 0) {
          showMessage('⏰ זו ההתאמה האחרונה שלך היום', 'warning');
        }
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

  // Export results
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

  // Payment
  const payWithWhatsApp = () => {
    showMessage('מפנה לוואטסאפ לתשלום...', 'success');
    
    const message = `שלום! אני רוצה לשדרג לגרסה המלאה (39 ש״ח)
📱 מספר טלפון: ${currentUser.phone}
👤 שם: ${currentUser.fullName}
📊 כמות מוזמנים: ${matchingResults.length}
🔍 ID בקשה: ${Date.now()}
    
אנא שלח לי קישור לביט לתשלום. תודה!`;
    
    const whatsappURL = `https://wa.me/972507676706?text=${encodeURIComponent(message)}`;
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
            setCurrentUser((prev) => ({ ...prev, isPro: true, remainingMatches: 999999 }));
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

  // Filters - 🔥 משודרג (ללא searchTerm)
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

  // Helper to get relevant guest details
  const getRelevantGuestDetails = (guestDetails) => {
    // פשוט מחזיר את מה שהשרת כבר חילץ בצורה חכמה!
    return guestDetails || {};
  };

// המשך מחלק 2... הרנדור הראשי:

  return (
    <div>
      <style>{`
        /* כל ה-CSS נשאר זהה למקור, רק נוסיף כמה שיפורים קלים */
        
        /* 🔥 הסתרת שדות בזמן הזנת קוד */
        .auth-fields-hidden {
          display: none;
          opacity: 0;
          height: 0;
          overflow: hidden;
        }
        
        .auth-fields-visible {
          display: block;
          opacity: 1;
          animation: fadeIn 0.3s ease-in;
        }
        
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        /* 🔥 כפתור חזרה */
        .btn-back {
          background: #6c757d;
          color: white;
          padding: 10px 20px;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-size: 0.9rem;
          transition: all 0.3s ease;
        }
        
        .btn-back:hover {
          background: #5a6268;
          transform: translateY(-2px);
        }
        
        /* 🔥 אינדיקטור התאמה מושלמת */
        .perfect-match-badge {
          background: linear-gradient(135deg, #00ff88, #00cc6a);
          color: white;
          padding: 8px 16px;
          border-radius: 20px;
          font-weight: bold;
          display: inline-block;
          margin: 10px 0;
          animation: pulse 2s infinite;
        }
        
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        
        /* 🔥 אזהרת מגבלה */
        .limit-warning-urgent {
          background: linear-gradient(135deg, #ff6b6b, #ee5a52);
          color: white;
          padding: 15px;
          border-radius: 10px;
          margin: 15px 0;
          text-align: center;
          font-weight: 600;
          animation: shake 0.5s;
        }
        
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-10px); }
          75% { transform: translateX(10px); }
        }

        /* שאר ה-CSS המקורי... */
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

        /* שאר ה-CSS... */
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
                  <li>🎯 100% = התאמה מושלמת (מוצגת ראשונה!)</li>
                  <li>✨ 93%+ = בחירה אוטומטית (עד 3 תוצאות)</li>
                  <li>📱 מוסיפה מספרי טלפון למוזמנים</li>
                  <li>⚡ חוסכת שעות של עבודה ידנית!</li>
                  <li>🎁 30 התאמות חינם כל 24 שעות!</li>
                  <li>💾 שמירה אוטומטית כל 10 מוזמנים</li>
                </ul>
              </div>
              <button className="btn btn-primary" onClick={startAuth}>
                🚀 בואו נתחיל!
              </button>
            </div>
          )}

          {/* --- מסך אימות - 🔥 משודרג --- */}
          {currentScreen === 'authScreen' && (
            <div className="auth-screen" style={{ textAlign: 'center' }}>
              <h2>🔐 אימות משתמש</h2>
              <p>הזן את הפרטים שלך כדי להתחיל</p>

              {/* 🔥 שדות שם וטלפון - מוסתרים כשמזינים קוד */}
              <div className={showCodeInput ? 'auth-fields-hidden' : 'auth-fields-visible'}>
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
                >
                  {isLoading ? '⏳ טוען...' : '📱 שלח קוד אימות'}
                </button>
              </div>

              {/* 🔥 שדה קוד - מוצג רק אחרי שליחת קוד */}
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
                    />
                  </div>

                  {isLoading && <div className="loading-spinner"></div>}

                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                    {/* 🔥 כפתור חזרה */}
                    <button
                      className="btn-back"
                      onClick={backToPhoneScreen}
                      disabled={isLoading}
                      type="button"
                    >
                      ⬅️ חזרה
                    </button>

                    <button
                      className="btn btn-primary"
                      onClick={verifyCode}
                      disabled={isLoading}
                      type="button"
                    >
                      {isLoading ? '⏳ טוען...' : '✅ אמת קוד'}
                    </button>
                  </div>
                </div>
              )}

              <div style={{ marginTop: '20px' }}>
                <button className="btn btn-secondary" onClick={goToLanding} disabled={isLoading}>
                  ⬅️ חזרה לדף הבית
                </button>
              </div>
            </div>
          )}

          {/* --- מסך העלאת קבצים --- */}
          {currentScreen === 'uploadScreen' && (
            <div>
              <h2>📁 העלה את הקבצים שלך</h2>
              
              {/* 🔥 הצגת מגבלה יומית */}
              {!currentUser.isPro && (
                <div className={currentUser.remainingMatches <= 5 ? 'limit-warning-urgent' : 'limit-warning'}>
                  📊 מגבלה יומית: {currentUser.dailyMatchesUsed}/{DAILY_LIMIT} התאמות
                  <br />
                  {currentUser.remainingMatches > 0 ? (
                    <>נותרו לך {currentUser.remainingMatches} התאמות</>
                  ) : (
                    <>⏰ המגבלה תתאפס בעוד {currentUser.resetTime}</>
                  )}
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
                💡 <strong>טיפ:</strong> המערכת ממיינת את התוצאות - קודם כל ההתאמות המושלמות (100%), אחר כך הגבוהות (93%+)
              </div>
            </div>
          )}

          {/* המשך בחלק 4 - מסך התאמות... */}
          {currentScreen === 'matchingScreen' && (
            <div className="matching-layout">
              {/* Sidebar */}
              <div className="sidebar">
                {/* 🔥 הצגת checkpoint אם קיים */}
                {hasCheckpoint && checkpointData && (
                  <div className="sidebar-section">
                    <div className="sidebar-title">💾 התקדמות שמורה</div>
                    <div style={{ 
                      background: '#fff3cd', 
                      padding: '15px', 
                      borderRadius: '10px',
                      marginBottom: '15px'
                    }}>
                      <p style={{ margin: '0 0 10px 0' }}>
                        נמצאה התקדמות שמורה במוזמן {checkpointData.progress}
                      </p>
                      <button
                        className="btn btn-primary btn-sidebar"
                        onClick={restoreFromCheckpoint}
                        style={{ fontSize: '0.85rem' }}
                      >
                        📂 המשך מהשמירה
                      </button>
                    </div>
                  </div>
                )}

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

                {/* 🔥 פילטרים - ללא searchTerm! */}
                <div className="sidebar-section">
                  <div className="sidebar-title">🔍 פילטרים</div>
                  
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

                {/* 🔥 אזור פרימיום */}
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
                      <div style={{ fontSize: '0.8rem', marginBottom: '5px' }}>
                        נותרו: {currentUser.remainingMatches}
                      </div>
                      <div style={{ fontSize: '0.75rem', marginBottom: '15px' }}>
                        איפוס בעוד: {currentUser.resetTime}
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

              {/* Main content - ימשיך בחלק הבא */}
            </div>
          )}

          {/* הודעות */}
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