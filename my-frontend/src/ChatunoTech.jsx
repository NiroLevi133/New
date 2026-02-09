import React, { useState, useEffect, useRef } from 'react';
import './ChatunoTech.css';
import { AuthScreen, LandingPage, ContactsGuideModal } from './AuthScreen';
import { UploadScreen, MatchingSidebar, GuestCard, SuccessScreen } from './MatchingScreen';

const ChatunoTech = () => {
  // Constants
  const API_BASE_URL = 'https://new-569016630628.europe-west1.run.app';

  // State
  const [currentScreen, setCurrentScreen] = useState('landingPage');
  const [currentUser, setCurrentUser] = useState({
    phone: '',
    fullName: '',
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
  const [manualPhone, setManualPhone] = useState('');
  const [searchInContacts, setSearchInContacts] = useState('');
  const [supportsMobileContacts, setSupportsMobileContacts] = useState(false);
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [allContactsData, setAllContactsData] = useState([]);

  // Auth
  const [phoneValue, setPhoneValue] = useState('');
  const [fullNameValue, setFullNameValue] = useState('');
  const [authError, setAuthError] = useState('');
  const [autoSelectedCount, setAutoSelectedCount] = useState(0);
  const [perfectMatchesCount, setPerfectMatchesCount] = useState(0);

  const isProcessingRef = useRef(false);
  const [skipFilledPhones, setSkipFilledPhones] = useState(false);
  const [phoneColumnInfo, setPhoneColumnInfo] = useState(null);
  const [showPhoneColumnDialog, setShowPhoneColumnDialog] = useState(false);

  // Session resume
  const [showResumeDialog, setShowResumeDialog] = useState(false);
  const [savedSession, setSavedSession] = useState(null);

  // Check mobile support
  useEffect(() => {
    checkMobileSupport();
  }, []);

  const checkMobileSupport = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/check-mobile-support`);
      const data = await response.json();
      setSupportsMobileContacts(data.supports_contacts_api);
    } catch {
      setSupportsMobileContacts(false);
    }
  };

  // Helper functions
  const showMessage = (text, type) => {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: '', type: '' }), 5000);
  };

  // ============================================================
  // 🔥 NEW: Simple Register - replaces sendCode + verifyCode + saveFullName
  // ============================================================
  const handleRegister = async () => {
    const phoneRegex = /^05\d{8}$/;
    if (!phoneRegex.test(phoneValue)) {
      setAuthError('❌ מספר טלפון לא תקין (05XXXXXXXX)');
      return;
    }

    const nameRegex = /^[\u0590-\u05FFa-zA-Z\s]{2,}$/;
    if (!nameRegex.test(fullNameValue.trim())) {
      setAuthError('❌ שם לא תקין - נדרש לפחות 2 תווים');
      return;
    }

    setAuthError('');
    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phoneValue,
          full_name: fullNameValue.trim()
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'שגיאה בהרשמה');
      }

      const data = await response.json();

      setCurrentUser({
        phone: phoneValue,
        fullName: data.user.full_name,
      });

      showMessage(`✅ שלום ${data.user.full_name}! ברוכים הבאים`, 'success');

      setTimeout(() => {
        setCurrentScreen('uploadScreen');
      }, 1000);

    } catch (error) {
      setAuthError(`❌ ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // ============================================================
  // File Upload
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
      console.error('❌ Check phone column error:', error);
      setPhoneColumnInfo(null);
      setSkipFilledPhones(false);
      setShowPhoneColumnDialog(false);
    }
  };

  // Mobile Contacts
  const requestMobileContacts = async () => {
    if (!('contacts' in navigator) || !('ContactsManager' in window)) {
      showMessage('❌ הדפדפן לא תומך', 'error');
      return;
    }

    try {
      setIsLoading(true);
      const contacts = await navigator.contacts.select(['name', 'tel'], { multiple: true });

      const formattedContacts = contacts.map(contact => ({
        name: contact.name?.[0] || 'ללא שם',
        phone: contact.tel?.[0] || ''
      })).filter(contact => contact.phone);

      setMobileContacts(formattedContacts);
      setAllContactsData(formattedContacts);
      setContactsSource('mobile');
      setUploadedFiles(prev => ({ ...prev, contacts: 'mobile_contacts' }));

      showMessage(`✅ נטענו ${formattedContacts.length} אנשי קשר!`, 'success');
    } catch {
      showMessage('❌ לא ניתן לגשת לאנשי קשר', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // ============================================================
  // Session management
  // ============================================================
  const autoSaveSession = async () => {
    if (!currentUser.phone || matchingResults.length === 0) return;

    try {
      const sessionData = {
        phone: currentUser.phone,
        matching_results: matchingResults,
        selected_contacts: selectedContacts,
        current_guest_index: currentGuestIndex,
        file_hash: fileHash,
        filters: filters,
        skip_filled_phones: skipFilledPhones,
        auto_selected_count: autoSelectedCount,
        perfect_matches_count: perfectMatchesCount,
        timestamp: new Date().toISOString(),
        current_progress: `${currentGuestIndex + 1}/${matchingResults.length}`
      };

      await fetch(`${API_BASE_URL}/save-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionData)
      });
    } catch (error) {
      console.error('Failed to save session:', error);
    }
  };

  useEffect(() => {
    if (currentScreen === 'matchingScreen' && matchingResults.length > 0) {
      const interval = setInterval(autoSaveSession, 60000);
      return () => clearInterval(interval);
    }
  }, [currentScreen, matchingResults, selectedContacts, currentGuestIndex]);

  const checkExistingSession = async () => {
    if (!currentUser.phone) return;

    try {
      const response = await fetch(`${API_BASE_URL}/load-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: currentUser.phone })
      });

      const data = await response.json();

      if (data.status === 'success' && data.session_data) {
        setShowResumeDialog(true);
        setSavedSession(data.session_data);
      }
    } catch (error) {
      console.error('Failed to check session:', error);
    }
  };

  useEffect(() => {
    if (currentScreen === 'uploadScreen' && currentUser.phone) {
      checkExistingSession();
    }
  }, [currentScreen, currentUser.phone]);

  const resumeSession = () => {
    if (!savedSession) return;

    setMatchingResults(savedSession.matching_results || []);
    setSelectedContacts(savedSession.selected_contacts || {});
    setCurrentGuestIndex(savedSession.current_guest_index || 0);
    setFileHash(savedSession.file_hash || '');
    setFilters(savedSession.filters || {});
    setSkipFilledPhones(savedSession.skip_filled_phones || false);
    setAutoSelectedCount(savedSession.auto_selected_count || 0);
    setPerfectMatchesCount(savedSession.perfect_matches_count || 0);

    setCurrentScreen('matchingScreen');
    setShowResumeDialog(false);
    showMessage('✅ העבודה נטענה בהצלחה!', 'success');
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

  // ============================================================
  // Merge - NO LIMITS
  // ============================================================
  const startMerge = async () => {
    if (!uploadedFiles.guests || !uploadedFiles.contacts) {
      showMessage('אנא וודא שהקבצים הועלו', 'error');
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

      // Save files to GCS
      try {
        await fetch(`${API_BASE_URL}/save-files?phone=${currentUser.phone}`, {
          method: 'POST',
          body: formData,
        });
      } catch {
        console.warn('File save to GCS failed, continuing...');
      }

      // Merge
      const response = await fetch(`${API_BASE_URL}/merge-files`, {
        method: 'POST',
        body: formData,
      });

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

      const autoSelections = {};
      data.results.forEach(result => {
        if (result.auto_selected) {
          autoSelections[result.guest] = result.auto_selected;
        }
      });
      setSelectedContacts(autoSelections);

      setCurrentScreen('matchingScreen');
    } catch (error) {
      showMessage(`שגיאה: ${error.message}`, 'error');
      setCurrentScreen('uploadScreen');
    } finally {
      setIsLoading(false);
    }
  };

  // ============================================================
  // Matching logic
  // ============================================================
  const selectCandidate = (candidate) => {
    const currentGuest = matchingResults[currentGuestIndex];
    setSelectedContacts((prev) => ({
      ...prev,
      [currentGuest.guest]: candidate,
    }));
    setManualPhone('');
    setSearchInContacts('');
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
    selectCandidate({ ...contact, reason: 'נמצא בחיפוש' });
    setSearchInContacts('');
    setShowSuggestions(false);
    setSearchSuggestions([]);
    showMessage(`✅ נבחר: ${contact.name}`, 'success');
  };

  // Navigation - NO LIMITS
  const nextGuest = () => {
    if (isProcessingRef.current) return;

    const currentGuest = matchingResults[currentGuestIndex];

    if (!selectedContacts[currentGuest.guest]) {
      showMessage('❌ אנא בחר מועמד', 'error');
      return;
    }

    isProcessingRef.current = true;

    const newIndex = currentGuestIndex + 1;
    if (newIndex < matchingResults.length) {
      setCurrentGuestIndex(newIndex);
    } else {
      setCurrentScreen('successScreen');
    }

    isProcessingRef.current = false;
  };

  const previousGuest = () => {
    if (currentGuestIndex > 0) {
      setCurrentGuestIndex((prev) => prev - 1);
    }
  };

  // Export
  const exportResults = async () => {
    try {
      setIsLoading(true);
      showMessage('📄 מכין קובץ...', 'success');

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

      if (!response.ok) throw new Error('שגיאה בייצוא');

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

  // Filters
  const getFilteredResults = () => {
    if (!matchingResults) return [];
    return matchingResults.filter(result => {
      const details = result.guest_details || {};
      if (filters.side) {
        const side = details['צד'] || details['side'] || '';
        if (!side.toLowerCase().includes(filters.side.toLowerCase())) return false;
      }
      if (filters.group) {
        const group = details['קבוצה'] || details['group'] || details['קטגוריה'] || '';
        if (!group.toLowerCase().includes(filters.group.toLowerCase())) return false;
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

  // Loading Screen
  const LoadingScreenWithTimer = () => {
    const [showWaitMessage, setShowWaitMessage] = useState(false);

    useEffect(() => {
      const timer = setTimeout(() => setShowWaitMessage(true), 10000);
      return () => clearTimeout(timer);
    }, []);

    return (
      <div style={{ textAlign: 'center' }}>
        <h2>⏳ מבצע מיזוג...</h2>
        <div className="loading-spinner"></div>
        <p>מנתח קבצים...</p>
        <div style={{
          background: 'rgba(42, 157, 143, 0.1)',
          padding: '15px',
          borderRadius: '10px',
          margin: '20px 0',
          minHeight: '80px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center'
        }}>
          {showWaitMessage ? (
            <p style={{ fontWeight: 'bold', color: '#2a9d8f', margin: 0 }}>
              אל דאגה, לא נתקעתי! לפעמים לוקח לי זמן לחשוב ולמצוא התאמות בשביל שאתם לא תצטרכו.
            </p>
          ) : (
            <p style={{ margin: 0 }}>
              💡 <strong>טיפ:</strong> מומלץ לאחד קבצי אנשי קשר של החתן, הכלה והמשפחה לקובץ אחד לדיוק מירבי!
            </p>
          )}
        </div>
      </div>
    );
  };

  // Resume Dialog
  const ResumeSessionDialog = ({ savedSession, onResume, onNewSession }) => {
    if (!savedSession) return null;

    return (
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9999, padding: '20px'
      }}>
        <div style={{
          background: 'white', borderRadius: '20px', padding: '30px',
          maxWidth: '500px', textAlign: 'center'
        }}>
          <h2>🔄 נמצאה עבודה שמורה!</h2>
          <div style={{
            background: '#f1f8ff', padding: '15px', borderRadius: '10px',
            margin: '20px 0', textAlign: 'right'
          }}>
            <div>📅 תאריך: {new Date(savedSession.timestamp).toLocaleDateString('he-IL')}</div>
            <div>📊 התקדמות: {savedSession.current_progress}</div>
            <div>✅ התאמות שנעשו: {Object.keys(savedSession.selected_contacts || {}).length}</div>
          </div>
          <p style={{ fontSize: '1.1rem', marginBottom: '25px' }}>האם להמשיך מאיפה שהפסקת?</p>
          <div style={{ display: 'flex', gap: '15px', justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={onResume}>✅ המשך עבודה</button>
            <button className="btn btn-secondary" onClick={onNewSession}>🆕 התחל מחדש</button>
          </div>
        </div>
      </div>
    );
  };

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="app-container">
      <div className="content-card">

        {/* Landing Page */}
        {currentScreen === 'landingPage' && (
          <LandingPage onStart={() => setCurrentScreen('authScreen')} />
        )}

        {/* Auth Screen - SIMPLIFIED */}
        {currentScreen === 'authScreen' && (
          <AuthScreen
            phoneValue={phoneValue}
            setPhoneValue={setPhoneValue}
            fullNameValue={fullNameValue}
            setFullNameValue={setFullNameValue}
            isLoading={isLoading}
            onRegister={handleRegister}
            errorMessage={authError}
          />
        )}

        {/* Upload Screen */}
        {currentScreen === 'uploadScreen' && (
          <UploadScreen
            currentUser={currentUser}
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
        {currentScreen === 'loadingScreen' && <LoadingScreenWithTimer />}

        {/* Matching Screen */}
        {currentScreen === 'matchingScreen' && (
          <div className="matching-layout">
            <MatchingSidebar
              currentUser={currentUser}
              exportResults={exportResults}
              isLoading={isLoading}
              currentGuestIndex={currentGuestIndex}
              filters={filters}
              setFilters={setFilters}
              getUniqueValues={getUniqueValues}
            />

            <div className="main-content">
              {(() => {
                const filteredResults = getFilteredResults();
                const currentGuest = filteredResults[currentGuestIndex] || matchingResults[currentGuestIndex];

                if (!currentGuest) return <div>אין מוזמנים</div>;

                const isSelected = !!selectedContacts[currentGuest.guest];

                return (
                  <>
                    <GuestCard
                      currentGuest={currentGuest}
                      currentGuestIndex={currentGuestIndex}
                      totalGuests={filteredResults.length}
                      selectedContacts={selectedContacts}
                      selectCandidate={selectCandidate}
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
                        disabled={currentGuestIndex === 0 || isLoading}
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
              setSkipFilledPhones(false);
              setPhoneColumnInfo(null);
              setShowPhoneColumnDialog(false);
              setCurrentScreen('uploadScreen');
            }}
          />
        )}

        {/* Modals */}
        {showContactsGuide && (
          <ContactsGuideModal onClose={() => setShowContactsGuide(false)} />
        )}

        {showResumeDialog && (
          <ResumeSessionDialog
            savedSession={savedSession}
            onResume={resumeSession}
            onNewSession={() => { setShowResumeDialog(false); setSavedSession(null); }}
          />
        )}

        {showPhoneColumnDialog && phoneColumnInfo && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, padding: '20px'
          }}>
            <div style={{
              background: 'white', borderRadius: '20px', padding: '30px',
              maxWidth: '500px', textAlign: 'center'
            }}>
              <h3 style={{ marginBottom: '20px' }}>📞 מצאנו עמודת טלפון בקובץ!</h3>
              <div style={{
                background: '#f1f8ff', padding: '15px', borderRadius: '10px',
                marginBottom: '20px', textAlign: 'right'
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
                    showMessage('✅ נדלג על מוזמנים עם מספר קיים', 'success');
                  }}
                >
                  ✅ כן, דלג
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => { setSkipFilledPhones(false); setShowPhoneColumnDialog(false); }}
                >
                  📝 לא, עדכן את כולם
                </button>
              </div>
            </div>
          </div>
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
