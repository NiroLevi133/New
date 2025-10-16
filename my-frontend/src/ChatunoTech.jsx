import React, { useState, useEffect, useRef, useCallback } from 'react';
import './ChatunoTech.css';
import { AuthScreen, LandingPage, LimitReachedScreen, ContactsGuideModal } from './AuthScreen';
import { UploadScreen, MatchingSidebar, GuestCard, SuccessScreen } from './MatchingScreen';

const ChatunoTech = () => {
  // ============================================================
  // Constants
  // ============================================================
  const API_BASE_URL = 'https://new-569016630628.europe-west1.run.app';
  const DAILY_LIMIT = 30;
  const AUTO_SELECT_TH = 93; // 🔥 הקבוע הדרוש לבולטות אוטומטית (93%+)

  // ============================================================
  // State
  // ============================================================
  const [currentScreen, setCurrentScreen] = useState('landingPage');
  const [currentUser, setCurrentUser] = useState({
    phone: '',
    fullName: '',
    remainingMatches: 30,
    isPro: false,
    hoursUntilReset: 0,
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
  const [filters, setFilters] = useState({ side: '', group: '' });
  const [showAddContact, setShowAddContact] = useState(false);
  const [manualPhone, setManualPhone] = useState('');
  const [searchInContacts, setSearchInContacts] = useState('');
  const [supportsMobileContacts, setSupportsMobileContacts] = useState(false);
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [allContactsData, setAllContactsData] = useState([]);

  // Auth state
  const [phoneValue, setPhoneValue] = useState('');
  const [fullNameValue, setFullNameValue] = useState('');
  const [codeValue, setCodeValue] = useState('');
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [autoSelectedCount, setAutoSelectedCount] = useState(0);
  const [perfectMatchesCount, setPerfectMatchesCount] = useState(0);
  
  // Batch tracking & UI
  const [matchesUsedInSession, setMatchesUsedInSession] = useState(0);
  const isProcessingRef = useRef(false);
  const [skipFilledPhones, setSkipFilledPhones] = useState(false);
  const [phoneColumnInfo, setPhoneColumnInfo] = useState(null);
  const [showPhoneColumnDialog, setShowPhoneColumnDialog] = useState(false);
  const timerRef = useRef(null);

  // ============================================================
  // Utility & Helper Functions
  // ============================================================

  const checkMobileSupport = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/check-mobile-support`, {
        headers: { 'User-Agent': navigator.userAgent }
      });
      const data = await response.json();
      setSupportsMobileContacts(data.supports_contacts_api);
    } catch (error) {
      setSupportsMobileContacts(false);
    }
  };

  useEffect(() => {
    checkMobileSupport();
    return () => clearTimeout(timerRef.current);
  }, []);
  
  const showMessage = (text, type = 'info') => {
    setMessage({ text, type });
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setMessage({ text: '', type: '' }), 4000);
  };

  const formatResetTime = (hours) => {
    if (hours <= 0) return "ההגבלה אופסה!";
    const totalMinutes = Math.floor(hours * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h > 0) return `${h} שעות ו-${m} דקות`;
    return `${m} דקות`;
  };

  const getFilteredResults = useCallback(() => {
    if (!filters.side && !filters.group) {
      return matchingResults;
    }
    
    // Simplifed filtering logic based on smart fields (must match logic in MatchingScreen.jsx)
    const getSmartDetailValue = (details, keys) => {
        for (const [detailKey, value] of Object.entries(details)) {
            if (keys.some(k => detailKey.toLowerCase().trim() === k.toLowerCase().trim()) && value && String(value).trim() !== 'nan') {
                return String(value).trim();
            }
        }
        return '';
    };

    const sideKeys = ['צד', 'side', 'חתן', 'כלה', 'צד הכלה', 'צד החתן'];
    const groupKeys = ['קבוצה', 'group', 'קטגוריה', 'category', 'משפחה', 'חברים'];

    return matchingResults.filter(guest => {
      const details = guest.guest_details || {};
      
      const guestSide = getSmartDetailValue(details, sideKeys);
      const guestGroup = getSmartDetailValue(details, groupKeys);
      
      const sideMatch = !filters.side || (guestSide.toLowerCase() === filters.side.toLowerCase());
      const groupMatch = !filters.group || (guestGroup.toLowerCase() === filters.group.toLowerCase());
      
      return sideMatch && groupMatch;
    });
  }, [matchingResults, filters]);

  const getUniqueValues = (key) => {
    const values = new Set();
    
    const keysToCheck = {
        'צד': ['צד', 'side', 'חתן', 'כלה', 'צד הכלה', 'צד החתן'],
        'קבוצה': ['קבוצה', 'group', 'קטגוריה', 'category', 'משפחה', 'חברים']
    }[key] || [];

    matchingResults.forEach(guest => {
        const details = guest.guest_details || {};
        for (const [detailKey, value] of Object.entries(details)) {
            if (keysToCheck.some(k => detailKey.toLowerCase().trim() === k.toLowerCase().trim()) && value && String(value).trim() !== 'nan') {
                values.add(String(value).trim());
                break;
            }
        }
    });
    return Array.from(values).sort();
  };

  // ============================================================
  // Auth Handlers
  // ============================================================

  const sendCode = async () => {
    const phoneRegex = /^05\d{8}$/;
    if (!phoneRegex.test(phoneValue)) {
      showMessage('❌ מספר טלפון לא תקין', 'error');
      return;
    }

    const nameRegex = /^[\u0590-\u05FFa-zA-Z\s]{2,}$/;
    if (!nameRegex.test(fullNameValue.trim())) {
      showMessage('❌ שם לא תקין', 'error');
      return;
    }

    try {
      setIsLoading(true);
      showMessage('📱 שולח קוד...', 'success');
      
      const response = await fetch(`${API_BASE_URL}/send-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          phone: phoneValue,
          full_name: fullNameValue 
        })
      });

      if (response.ok) {
        showMessage('📱 קוד נשלח בהצלחה!', 'success');
        setShowCodeInput(true);
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
      showMessage(`❌ ${error.message}`, 'error');
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          phone: phoneValue, 
          code: codeValue,
          full_name: fullNameValue
        })
      });

      if (response.ok) {
        const data = await response.json();
        
        if (data.status === 'expired') {
          showMessage('⏰ הקוד פג תוקף', 'error');
          setShowCodeInput(false);
          setCodeValue('');
          return;
        }
        
        if (data.status === 'success') {
          setCurrentUser((prev) => ({ 
            ...prev, 
            remainingMatches: data.remaining_matches || 30,
            isPro: data.is_premium || false,
            hoursUntilReset: data.hours_until_reset || 0
          }));

          if (data.is_premium) {
            showMessage('✅ פרימיום ללא הגבלה! 💎', 'success');
          } else {
            showMessage(
              `✅ נותרו ${data.remaining_matches} התאמות (מתוך ${DAILY_LIMIT})`,
              'success'
            );
          }
          
          setTimeout(() => {
            if (data.remaining_matches <= 0 && !data.is_premium) {
              showMessage(
                `⏰ נגמרו ההתאמות. איפוס בעוד ${formatResetTime(data.hours_until_reset)}`,
                'warning'
              );
              setTimeout(() => setCurrentScreen('limitReached'), 2000);
            } else {
              setTimeout(() => setCurrentScreen('uploadScreen'), 1500);
            }
          }, 1000);
        } else {
          showMessage('❌ קוד שגוי', 'error');
        }
      }
    } catch (error) {
      showMessage(`❌ שגיאה: ${error.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const backToPhoneScreen = () => {
    setShowCodeInput(false);
    setCodeValue('');
    showMessage('ניתן לשלוח קוד חדש', 'info');
  };

  // ============================================================
  // File Upload & Merge Handlers
  // ============================================================

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
      
      if (type === 'guests') {
        await checkPhoneColumnInFile(file);
      }
      
      showMessage(`קובץ נטען בהצלחה`, 'success');
      
    } catch (error) {
      showMessage(`שגיאה: ${error.message}`, 'error');
    }
  };

  const checkPhoneColumnInFile = async (file) => {
    try {
      const formData = new FormData();
      formData.append('guests_file', file);

      const response = await fetch(`${API_BASE_URL}/check-phone-column`, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        setPhoneColumnInfo(data);
        
        if (data.has_phone_column && data.filled_count > 0) {
          setShowPhoneColumnDialog(true);
        } else {
          setSkipFilledPhones(false);
          setShowPhoneColumnDialog(false);
        }
      }
    } catch (error) {
      setPhoneColumnInfo(null);
      setSkipFilledPhones(false);
      setShowPhoneColumnDialog(false);
    }
  };

  const requestMobileContacts = async () => {
    if (!('contacts' in navigator) || !('ContactsManager' in window)) {
      showMessage('❌ הדפדפן לא תומך', 'error');
      return;
    }

    try {
      setIsLoading(true);
      showMessage('📱 מבקש גישה...', 'success');

      const contacts = await navigator.contacts.select(['name', 'tel'], { multiple: true });
      
      const formattedContacts = contacts.map(contact => ({
        name: contact.name?.[0] || 'ללא שם',
        phone: contact.tel?.[0] || ''
      })).filter(contact => contact.phone);

      setMobileContacts(formattedContacts);
      setContactsSource('mobile');
      setUploadedFiles(prev => ({ ...prev, contacts: 'mobile_contacts' }));
      
      showMessage(`✅ נטענו ${formattedContacts.length} אנשי קשר!`, 'success');
      
    } catch (error) {
      showMessage('❌ לא ניתן לגשת לאנשי קשר', 'error');
    } finally {
      setIsLoading(false);
    }
  };
  
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

  const startMerge = async () => {
    if (!uploadedFiles.guests || !uploadedFiles.contacts) {
      showMessage('אנא וודא שהקבצים הועלו', 'error');
      return;
    }

    if (!currentUser.isPro && currentUser.remainingMatches <= 0) {
      showMessage(
        `⏰ נגמרו ההתאמות. חזור בעוד ${formatResetTime(currentUser.hoursUntilReset)}`,
        'warning'
      );
      setTimeout(() => setCurrentScreen('limitReached'), 2000);
      return;
    }
    
    setCurrentScreen('loadingScreen');
    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append('guests_file', uploadedFiles.guests);
      formData.append('phone', currentUser.phone);
      formData.append('contacts_source', contactsSource);
      formData.append('skip_filled_phones', skipFilledPhones ? 'true' : 'false'); 

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

      if (response.status === 403) {
        const errorData = await response.json();
        if (errorData.error === 'daily_limit_exceeded') {
          showMessage(
            `⏰ נגמרו ההתאמות`,
            'warning'
          );
          setTimeout(() => setCurrentScreen('limitReached'), 3000);
          return;
        }
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'שגיאה בעיבוד');
      }

      const data = await response.json();
      setMatchingResults(data.results);
      setFileHash(data.file_hash);
      setAutoSelectedCount(data.auto_selected_count || 0);
      setPerfectMatchesCount(data.perfect_matches_count || 0);
      
      const allContacts = extractAllContacts(data.results);
      setAllContactsData(allContacts);
      
      setCurrentGuestIndex(0);
      setMatchesUsedInSession(0);

      const autoSelections = {};
      data.results.forEach(result => {
        if (result.auto_selected) {
          autoSelections[result.guest] = result.auto_selected;
        }
      });

      setSelectedContacts(autoSelections);

      if (data.remaining_matches !== undefined) {
        setCurrentUser(prev => ({
          ...prev,
          remainingMatches: data.remaining_matches
        }));
      }

      setCurrentScreen('matchingScreen');
    } catch (error) {
      showMessage(`שגיאה: ${error.message}`, 'error');
      setCurrentScreen('uploadScreen');
    } finally {
      setIsLoading(false);
    }
  };

  // ============================================================
  // Matching Handlers
  // ============================================================

  const selectCandidate = (candidate) => {
    const currentGuest = matchingResults[currentGuestIndex];
    setSelectedContacts((prev) => {
      const isPreviouslySelected = prev[currentGuest.guest] && !prev[currentGuest.guest].isNotFound;
      const isNewSelection = candidate && !candidate.isNotFound;
      
      if (!currentUser.isPro && !isPreviouslySelected && isNewSelection) {
          if (currentUser.remainingMatches <= 0) {
              showMessage('❌ הגעת למגבלת ההתאמות היומית.', 'error');
              setTimeout(() => setCurrentScreen('limitReached'), 1000);
              return prev;
          }
          setMatchesUsedInSession(prevSession => prevSession + 1);
          setCurrentUser(prevUser => ({
              ...prevUser,
              remainingMatches: Math.max(0, prevUser.remainingMatches - 1)
          }));
      }

      return {
          ...prev,
          [currentGuest.guest]: candidate,
      };
    });
    
    setShowAddContact(false);
    setManualPhone('');
    setSearchInContacts('');
    setShowSuggestions(false);
  };

  const addManualContact = () => {
    if (!manualPhone.trim() || manualPhone.trim().length < 9) {
      showMessage('אנא הזן מספר תקין', 'error');
      return;
    }

    const newContact = {
      name: '📞 מספר ידני',
      phone: manualPhone.trim(),
      score: 100,
      reason: 'הוסף ידנית',
      isManual: true
    };

    selectCandidate(newContact);
    showMessage('✅ מספר נוסף!', 'success');
  };

  const handleSearchInput = (value) => {
    setSearchInContacts(value);
    
    if (value.length < 2) {
      setSearchSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const searchTerm = value.toLowerCase();
    let contactsToSearch = contactsSource === 'mobile' ? mobileContacts : allContactsData;

    const filtered = contactsToSearch.filter(contact => 
      contact.name.toLowerCase().includes(searchTerm) ||
      contact.phone.includes(value)
    );

    setSearchSuggestions(filtered);
    setShowSuggestions(filtered.length > 0);
  };

  const selectFromSuggestion = (contact) => {
    const selectedContact = {
      ...contact,
      reason: 'נמצא בחיפוש'
    };
    selectCandidate(selectedContact);
    setSearchInContacts('');
    setShowSuggestions(false);
    setSearchSuggestions([]);
    showMessage(`✅ נבחר: ${contact.name}`, 'success');
  };

  const nextGuest = async () => {
    if (isProcessingRef.current) {
      return;
    }

    const filteredResults = getFilteredResults();
    const currentGuest = filteredResults[currentGuestIndex];
    
    if (!selectedContacts[currentGuest.guest]) {
      showMessage('❌ אנא בחר מועמד', 'error');
      return;
    }

    if (!currentUser.isPro && currentUser.remainingMatches <= 0 && currentGuestIndex < filteredResults.length - 1) {
        showMessage('⏰ הגעת למגבלה היומית.', 'warning');
        await completeSession();
        setTimeout(() => setCurrentScreen('limitReached'), 2000);
        return;
    }

    isProcessingRef.current = true;
    setIsLoading(true);

    try {
      const newIndex = currentGuestIndex + 1;
      if (newIndex < filteredResults.length) {
        setCurrentGuestIndex(newIndex);
        setShowAddContact(false); // Clean up UI
      } else {
        await completeSession();
        setCurrentScreen('successScreen');
      }
      
    } catch (error) {
      showMessage('❌ שגיאה', 'error');
    } finally {
      isProcessingRef.current = false;
      setIsLoading(false);
    }
  };

  const previousGuest = () => {
    if (currentGuestIndex > 0) {
      setCurrentGuestIndex((prev) => prev - 1);
      setShowAddContact(false); // Clean up UI
    }
  };

  // ============================================================
  // Finalization Handlers
  // ============================================================

  const completeSession = async () => {
    if (matchesUsedInSession === 0 || !currentUser.phone || currentUser.isPro) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/complete-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: currentUser.phone,
          matches_used: matchesUsedInSession
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to update');
      }
      
      setMatchesUsedInSession(0);
    } catch (error) {
      console.error('❌ Complete session error:', error);
    }
  };

  const exportResults = async () => {
    try {
      setIsLoading(true);
      showMessage('📄 מכין קובץ...', 'success');

      await completeSession();

      const response = await fetch(`${API_BASE_URL}/export-results`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: currentUser.phone,
          results: matchingResults, 
          selected_contacts: selectedContacts,
          skip_filled: skipFilledPhones
        })
      });

      if (!response.ok) {
        throw new Error('שגיאה בייצוא');
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
      showMessage('❌ שגיאה בייצוא', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const payWithWhatsApp = () => {
    showMessage('מפנה לוואטסאפ...', 'success');
    
    const message = `שלום! אני רוצה לשדרג לפרימיום (39₪)
📱 טלפון: ${currentUser.phone}
👤 שם: ${currentUser.fullName}
📊 מוזמנים: ${matchingResults.length}
    
תודה!`;
    
    const whatsappURL = `https://wa.me/972507676706?text=${encodeURIComponent(message)}`;
    window.open(whatsappURL, '_blank');
    
    // checkPaymentStatus(); // השארת הפונקציה כרפרנס, היא צריכה להכיל לוגיקת בדיקה ב-API
  };

  const checkPaymentStatus = () => {
    showMessage('🔄 בודק תשלום...', 'success');
    // ... Implement API call to check payment status ...
  };

  // ============================================================
  // RENDER Components
  // ============================================================
  
  const LoadingScreenWithTimer = () => {
    const [showWaitMessage, setShowWaitMessage] = useState(false);

    useEffect(() => {
      const timer = setTimeout(() => {
        setShowWaitMessage(true);
      }, 10000);
      return () => clearTimeout(timer);
    }, []);

    const initialTip = '💡 <strong>טיפ:</strong> מומלץ לאחד קבצי אנשי קשר של החתן, הכלה והמשפחה לקובץ אחד לדיוק מירבי!';
    const longWaitMessage = 'אל דאגה, לא נתקעתי! לפעמים לוקח לי זמן לחשוב ולמצוא התאמות.';

    return (
      <div style={{ textAlign: 'center' }}>
        <h2>⏳ מבצע מיזוג...</h2>
        <div className="loading-spinner"></div>
        <p>מנתח קבצים...</p>
        <div 
          className="loading-tip-box" 
          style={{ 
            background: 'rgba(42, 157, 143, 0.1)', 
            padding: '15px', 
            borderRadius: '10px',
            margin: '20px 0',
            minHeight: '80px', 
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center'
          }}
        >
          {showWaitMessage ? (
            <p style={{ fontWeight: 'bold', color: '#2a9d8f', margin: 0 }}>
              {longWaitMessage}
            </p>
          ) : (
            <p style={{ margin: 0 }} dangerouslySetInnerHTML={{ __html: initialTip }} />
          )}
        </div>
      </div>
    );
  };
  
  const currentFilteredResults = getFilteredResults();
  
  // ============================================================
  // Main Return
  // ============================================================
  return (
    <div className="app-container">
      <div className="content-card">
        
        {/* Landing Page */}
        {currentScreen === 'landingPage' && (
          <LandingPage onStart={() => setCurrentScreen('authScreen')} />
        )}

        {/* Auth Screen */}
        {currentScreen === 'authScreen' && (
          <AuthScreen
            phoneValue={phoneValue}
            setPhoneValue={setPhoneValue}
            fullNameValue={fullNameValue}
            setFullNameValue={setFullNameValue}
            codeValue={codeValue}
            setCodeValue={setCodeValue}
            showCodeInput={showCodeInput}
            isLoading={isLoading}
            sendCode={sendCode}
            verifyCode={verifyCode}
            backToPhoneScreen={backToPhoneScreen}
          />
        )}

        {/* Upload Screen */}
        {currentScreen === 'uploadScreen' && (
          <UploadScreen
            currentUser={currentUser}
            DAILY_LIMIT={DAILY_LIMIT}
            uploadedFiles={uploadedFiles}
            handleFileUpload={handleFileUpload}
            supportsMobileContacts={supportsMobileContacts}
            requestMobileContacts={requestMobileContacts}
            isLoading={isLoading}
            startMerge={startMerge}
            setShowContactsGuide={setShowContactsGuide}
            API_BASE_URL={API_BASE_URL}
          />
        )}

        {/* Loading Screen */}
        {currentScreen === 'loadingScreen' && (
          <LoadingScreenWithTimer />
        )}

        {/* Limit Reached Screen */}
        {currentScreen === 'limitReached' && (
          <LimitReachedScreen
            currentUser={currentUser}
            selectedContactsCount={Object.keys(selectedContacts).length}
            onExport={exportResults}
            onUpgrade={payWithWhatsApp}
          />
        )}

        {/* Matching Screen */}
        {currentScreen === 'matchingScreen' && (
          <div className="matching-layout">
            <MatchingSidebar
              currentUser={currentUser}
              DAILY_LIMIT={DAILY_LIMIT}
              exportResults={exportResults}
              isLoading={isLoading}
              currentGuestIndex={currentGuestIndex}
              filters={filters}
              setFilters={setFilters}
              getUniqueValues={getUniqueValues}
              onUpgradeClick={() => setCurrentScreen('limitReached')}
            />

            <div className="main-content">
              {(() => {
                const filteredResults = currentFilteredResults;
                const currentGuest = filteredResults[currentGuestIndex];
                
                if (!currentGuest) {
                  return <div>אין מוזמנים</div>;
                }

                const isSelected = !!selectedContacts[currentGuest.guest];

                return (
                  <>
                    <GuestCard
                      currentGuest={currentGuest}
                      currentGuestIndex={currentGuestIndex}
                      totalGuests={filteredResults.length}
                      selectedContacts={selectedContacts}
                      selectCandidate={selectCandidate}
                      showAddContact={showAddContact}
                      setShowAddContact={setShowAddContact}
                      manualPhone={manualPhone}
                      setManualPhone={setManualPhone}
                      addManualContact={addManualContact}
                      searchInContacts={searchInContacts}
                      handleSearchInput={handleSearchInput}
                      showSuggestions={showSuggestions}
                      searchSuggestions={searchSuggestions}
                      selectFromSuggestion={selectFromSuggestion}
                      setSearchInContacts={setSearchInContacts}
                      setShowSuggestions={setShowSuggestions}
                      AUTO_SELECT_TH={AUTO_SELECT_TH} // 🔥 העברת הקבוע לבולטות אוטומטית
                    />

                    <div style={{ 
                      marginTop: '30px', 
                      display: 'flex', 
                      gap: '15px', 
                      justifyContent: 'center',
                      flexWrap: 'wrap'
                    }}>
                      <button 
                        className="btn btn-secondary"
                        onClick={previousGuest}
                        disabled={currentGuestIndex === 0 || isLoading}
                      >
                        ⬅️ הקודם
                      </button>
                      
                      <button 
                        className="btn btn-primary"
                        onClick={nextGuest}
                        disabled={!isSelected || isLoading}
                      >
                        {isLoading ? '⏳ מעבד...' : (currentGuestIndex === filteredResults.length - 1 ? '🎉 סיים' : 'הבא ➡️')}
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {/* Phone Column Dialog */}
        {showPhoneColumnDialog && phoneColumnInfo && (
          <div className="modal-overlay">
            <div className="modal-content">
              <h3>📞 מצאנו עמודת טלפון בקובץ!</h3>
              
              <div style={{
                background: '#f1f8ff',
                padding: '15px',
                borderRadius: '10px',
                marginBottom: '20px',
                textAlign: 'right'
              }}>
                <div>📊 <strong>סה״כ מוזמנים:</strong> {phoneColumnInfo.total_rows}</div>
                <div>✅ <strong>עם מספר:</strong> {phoneColumnInfo.filled_count}</div>
                <div>❌ <strong>בלי מספר:</strong> {phoneColumnInfo.empty_count}</div>
              </div>

              <p style={{ fontSize: '1.1rem', marginBottom: '25px' }}>
                האם לדלג על מוזמנים שיש להם כבר מספר טלפון?
              </p>

              <div style={{ display: 'flex', gap: '15px', justifyContent: 'center' }}>
                <button 
                  className="btn btn-primary"
                  onClick={() => {
                    setSkipFilledPhones(true);
                    setShowPhoneColumnDialog(false);
                    setCurrentScreen('matchingScreen');
                    showMessage('✅ נדלג על מוזמנים עם מספר קיים', 'success');
                  }}
                >
                  ✅ כן, דלג על מי שיש מספר
                </button>
                
                <button 
                  className="btn btn-secondary"
                  onClick={() => {
                    setSkipFilledPhones(false);
                    setShowPhoneColumnDialog(false);
                    setCurrentScreen('matchingScreen');
                    showMessage('📝 נעדכן את כולם', 'success');
                  }}
                >
                  📝 לא, עדכן את כולם
                </button>
              </div>

              <p style={{ 
                fontSize: '0.85rem', 
                color: '#666', 
                marginTop: '15px',
                fontStyle: 'italic'
              }}>
                💡 המערכת תמלא רק את השורות שבחרת להתאים
              </p>
            </div>
          </div>
        )}

        {/* Success Screen */}
        {currentScreen === 'successScreen' && (
          <SuccessScreen
            currentGuestIndex={currentFilteredResults.length - 1}
            autoSelectedCount={autoSelectedCount}
            perfectMatchesCount={perfectMatchesCount}
            exportResults={exportResults}
            isLoading={isLoading}
            onRestart={() => {
              setCurrentGuestIndex(0);
              setSelectedContacts({});
              setMatchingResults([]);
              setUploadedFiles({ guests: null, contacts: null });
              setMatchesUsedInSession(0);
              setFilters({ side: '', group: '' });
              setCurrentScreen('uploadScreen');
            }}
          />
        )}

        {/* Contacts Guide Modal */}
        {showContactsGuide && (
          <ContactsGuideModal onClose={() => setShowContactsGuide(false)} />
        )}

        {/* Messages */}
        {message.text && (
          <div className={`status-message status-${message.type}`}>
            {message.text}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatunoTech;