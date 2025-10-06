import React, { useState, useEffect } from 'react';
import './ChatunoTech.css';
import { AuthScreen, LandingPage, LimitReachedScreen, ContactsGuideModal } from './AuthScreen';
import { UploadScreen, MatchingSidebar, GuestCard, SuccessScreen } from './MatchingScreen';

const ChatunoTech = () => {
  // Constants
  const API_BASE_URL = 'https://new-569016630628.europe-west1.run.app';
  const DAILY_LIMIT = 30;
  
  // State
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

  // Auth
  const [phoneValue, setPhoneValue] = useState('');
  const [fullNameValue, setFullNameValue] = useState('');
  const [codeValue, setCodeValue] = useState('');
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [autoSelectedCount, setAutoSelectedCount] = useState(0);
  const [perfectMatchesCount, setPerfectMatchesCount] = useState(0);

  // Check mobile support
  useEffect(() => {
    checkMobileSupport();
  }, []);

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

  // Helper functions
  const showMessage = (text, type) => {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: '', type: '' }), 5000);
  };

  const formatResetTime = (hours) => {
    if (hours <= 0) return "המגבלה אופסה!";
    const totalMinutes = Math.floor(hours * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h > 0) return `${h} שעות ו-${m} דקות`;
    return `${m} דקות`;
  };

  // 🔥 Auth Functions
  const sendCode = async () => {
    const phoneRegex = /^05\d{8}$/;
    if (!phoneRegex.test(phoneValue)) {
      showMessage('❌ מספר טלפון לא תקין (צריך להתחיל ב-05 ו-10 ספרות)', 'error');
      return;
    }

    const nameRegex = /^[\u0590-\u05FFa-zA-Z\s]{2,}$/;
    if (!nameRegex.test(fullNameValue.trim())) {
      showMessage('❌ שם לא תקין (רק אותיות בעברית/אנגלית, לפחות 2 תווים)', 'error');
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
        showMessage('📱 קוד נשלח בהצלחה לווטסאפ!', 'success');
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
          showMessage('⏰ הקוד פג תוקף. אנא שלח קוד חדש.', 'error');
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

          // 🔥 פופאפ עם כמות ההתאמות
          if (data.is_premium) {
            showMessage('✅ אומת בהצלחה! יש לך מנוי פרימיום ללא הגבלה! 💎', 'success');
          } else {
            showMessage(
              `✅ אומת בהצלחה! נותרו לך ${data.remaining_matches} התאמות היום (מתוך ${DAILY_LIMIT})`,
              'success'
            );
          }
          
          setTimeout(() => {
            // 🔥 בדיקה אם נגמרו ההתאמות
            if (data.remaining_matches <= 0 && !data.is_premium) {
              showMessage(
                `⏰ נגמרו ההתאמות היומיות. המגבלה תתאפס בעוד ${formatResetTime(data.hours_until_reset)}`,
                'warning'
              );
              setTimeout(() => setCurrentScreen('limitReached'), 2000);
            } else {
              setTimeout(() => setCurrentScreen('uploadScreen'), 1500);
            }
          }, 1000);
        } else {
          showMessage('❌ קוד שגוי. נסה שוב.', 'error');
        }
      }
    } catch (error) {
      showMessage(`❌ שגיאה באימות הקוד: ${error.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const backToPhoneScreen = () => {
    setShowCodeInput(false);
    setCodeValue('');
    showMessage('ניתן לשלוח קוד חדש', 'info');
  };

  // 🔥 File Upload
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
      showMessage(`שגיאה: ${error.message}`, 'error');
    }
  };

  // 🔥 Mobile Contacts
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
      setAllContactsData(formattedContacts);
      setContactsSource('mobile');
      setUploadedFiles(prev => ({ ...prev, contacts: 'mobile_contacts' }));
      
      showMessage(`✅ נטענו ${formattedContacts.length} אנשי קשר מהטלפון!`, 'success');
      
    } catch (error) {
      showMessage('❌ לא ניתן לגשת לאנשי קשר. בדוק הרשאות או השתמש בקובץ.', 'error');
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

  // 🔥 Merge - עם טעינה חכמה
  const startMerge = async () => {
    if (!uploadedFiles.guests || !uploadedFiles.contacts) {
      showMessage('אנא וודא שהקבצים הועלו בהצלחה', 'error');
      return;
    }

    // 🔥 בדיקה לפני מיזוג
    if (!currentUser.isPro && currentUser.remainingMatches <= 0) {
      showMessage(
        `⏰ נגמרו ההתאמות היומיות. חזור בעוד ${formatResetTime(currentUser.hoursUntilReset)}`,
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
            `⏰ נגמרו ההתאמות היומיות. חזור בעוד ${errorData.formatted_time || '24 שעות'}`,
            'warning'
          );
          setTimeout(() => setCurrentScreen('limitReached'), 3000);
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
      setPerfectMatchesCount(data.perfect_matches_count || 0);
      
      const allContacts = extractAllContacts(data.results);
      setAllContactsData(allContacts);
      
      setCurrentGuestIndex(0);

      const autoSelections = {};
      data.results.forEach(result => {
        if (result.auto_selected) {
          autoSelections[result.guest] = result.auto_selected;
        }
      });

      setSelectedContacts(autoSelections);

      if (data.warning) {
        showMessage(`⚠️ ${data.warning}`, 'warning');
      }

      if (data.perfect_matches_count > 0) {
        showMessage(
          `🎯 מצאנו ${data.perfect_matches_count} התאמות מושלמות (100%)!`,
          'success'
        );
      }

      if (data.auto_selected_count > 0) {
        showMessage(
          `✨ ${data.auto_selected_count} מועמדים מומלצים מסומנים אוטומטית (93%+)`,
          'success'
        );
      }

      // 🔥 עדכון remaining matches מהשרת
      if (data.remaining_matches !== undefined) {
        setCurrentUser(prev => ({
          ...prev,
          remainingMatches: data.remaining_matches
        }));
      }

      setCurrentScreen('matchingScreen');
    } catch (error) {
      showMessage(`שגיאה במיזוג: ${error.message}`, 'error');
      setCurrentScreen('uploadScreen');
    } finally {
      setIsLoading(false);
    }
  };

  // 🔥 Select Candidate
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

  // 🔥 Add Manual
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

  // 🔥 Search
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
      reason: 'נמצא בחיפוש ידני'
    };
    selectCandidate(selectedContact);
    setSearchInContacts('');
    setShowSuggestions(false);
    setSearchSuggestions([]);
    showMessage(`✅ נבחר: ${contact.name}`, 'success');
  };

  // 🔥 Next Guest - עם עדכון שרת
  const nextGuest = async () => {
    const currentGuest = matchingResults[currentGuestIndex];
    
    if (!selectedContacts[currentGuest.guest]) {
      showMessage('❌ אנא בחר מועמד או סמן "לא נמצא" לפני המשך', 'error');
      return;
    }

    // 🔥 עדכון שרת
    if (!currentUser.isPro) {
      try {
        const response = await fetch(`${API_BASE_URL}/next-guest`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: currentUser.phone
          })
        });
        
        if (!response.ok) {
          throw new Error('Failed to update');
        }
        
        const data = await response.json();
        
        // ✅ עדכון מקומי רק אם הצליח
        setCurrentUser(prev => ({
          ...prev,
          remainingMatches: data.remaining_matches
        }));

        // 🔥 התראות מדורגות
        if (data.remaining_matches === 10) {
          showMessage('⚠️ נותרו רק 10 התאמות היום!', 'warning');
        } else if (data.remaining_matches === 5) {
          showMessage('🔔 נותרו רק 5 התאמות - שקול לשדרג!', 'warning');
        } else if (data.remaining_matches === 1) {
          showMessage('⏰ זו ההתאמה האחרונה שלך היום', 'warning');
        } else if (data.remaining_matches === 0) {
          showMessage('✅ השלמת את כל ה-30 ההתאמות היומיות!', 'success');
          setTimeout(() => setCurrentScreen('limitReached'), 2000);
          return;
        }
        
      } catch (error) {
        showMessage('❌ שגיאה בעדכון. נסה שוב.', 'error');
        return;
      }
    }

    // 🔥 מעבר למוזמן הבא
    const newIndex = currentGuestIndex + 1;
    if (newIndex < matchingResults.length) {
      setCurrentGuestIndex(newIndex);
    } else {
      setCurrentScreen('successScreen');
    }
  };

  const previousGuest = () => {
    if (currentGuestIndex > 0) {
      setCurrentGuestIndex((prev) => prev - 1);
    }
  };

  // 🔥 Export
  const exportResults = async () => {
    try {
      setIsLoading(true);
      showMessage('📄 מכין קובץ לייצוא...', 'success');

      const response = await fetch(`${API_BASE_URL}/export-results`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      showMessage('❌ שגיאה בייצוא הקובץ', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // 🔥 Payment
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
            setTimeout(() => setCurrentScreen('matchingScreen'), 2000);
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

  // 🔥 Filters
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

  // 🔥 RENDER
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
                const filteredResults = getFilteredResults();
                const currentGuest = filteredResults[currentGuestIndex] || matchingResults[currentGuestIndex];
                
                if (!currentGuest) {
                  return <div>אין מוזמנים להצגה</div>;
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
                        disabled={currentGuestIndex === 0}
                      >
                        ⬅️ הקודם
                      </button>
                      
                      <button 
                        className="btn btn-primary"
                        onClick={nextGuest}
                        disabled={!isSelected || isLoading}
                      >
                        {currentGuestIndex === filteredResults.length - 1 ? '🎉 סיים' : 'הבא ➡️'}
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {/* Success Screen */}
        {currentScreen === 'successScreen' && (
          <SuccessScreen
            currentGuestIndex={currentGuestIndex}
            autoSelectedCount={autoSelectedCount}
            perfectMatchesCount={perfectMatchesCount}
            exportResults={exportResults}
            isLoading={isLoading}
            onRestart={() => {
              setCurrentGuestIndex(0);
              setSelectedContacts({});
              setMatchingResults([]);
              setUploadedFiles({ guests: null, contacts: null });
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