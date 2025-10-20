import React, { useState, useEffect, useRef } from 'react';
import './ChatunoTech.css';
import { AuthScreen, LandingPage, LimitReachedScreen, ContactsGuideModal } from './AuthScreen';
import { UploadScreen, MatchingSidebar, GuestCard, SuccessScreen } from './MatchingScreen';

const ChatunoTech = () => {
  // Constants
  const API_BASE_URL = 'https://new-569016630628.europe-west1.run.app';
  const DAILY_LIMIT = 30;
  
  // State
  const [currentScreen, setCurrentScreen] = useState('landingPage'); 
  const [authStep, setAuthStep] = useState('phoneScreen'); // 🔥 'phoneScreen', 'codeScreen', 'nameScreen'
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
  const [autoSelectedCount, setAutoSelectedCount] = useState(0);
  const [perfectMatchesCount, setPerfectMatchesCount] = useState(0);

  // Batch tracking
  const [matchesUsedInSession, setMatchesUsedInSession] = useState(0);
  const isProcessingRef = useRef(false);
  const [skipFilledPhones, setSkipFilledPhones] = useState(false);
  const [phoneColumnInfo, setPhoneColumnInfo] = useState(null);
  const [showPhoneColumnDialog, setShowPhoneColumnDialog] = useState(false);

  // Check mobile support
  useEffect(() => {
    checkMobileSupport();
  }, []);

  const checkMobileSupport = async () => {
    try {
      // אם יש צורך בנקודת קצה כזו, יש להוסיף אותה ב-Backend
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
    if (hours <= 0) return "ההגבלה אופסה!";
    const totalMinutes = Math.floor(hours * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h > 0) return `${h} שעות ו-${m} דקות`;
    return `${m} דקות`;
  };

  // 🔥 Auth Functions (MODIFIED)
  const sendCode = async () => {
    const phoneRegex = /^05\d{8}$/;
    if (!phoneRegex.test(phoneValue)) {
      showMessage('❌ מספר טלפון לא תקין', 'error');
      return;
    }

    try {
      setIsLoading(true);
      
      // 🔥 קורא ל-send-code ללא שם (דרישה D)
      const response = await fetch(`${API_BASE_URL}/send-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          phone: phoneValue,
        })
      });

      if (response.ok) {
        setAuthStep('codeScreen'); // ➡️ מעבר לשלב הקוד
        setCurrentUser((prev) => ({ 
          ...prev, 
          phone: phoneValue,
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
      
      const response = await fetch(`${API_BASE_URL}/verify-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          phone: phoneValue, 
          code: codeValue,
        })
      });

      const data = await response.json();
      
      if (data.status === 'EXPIRED') {
        showMessage('⏰ הקוד פג תוקף', 'error');
        setAuthStep('phoneScreen');
        setCodeValue('');
        return;
      }
      
      if (data.status === 'NAME_REQUIRED') {
        showMessage('📝 אנא הזן שם מלא', 'info');
        setAuthStep('nameScreen'); // ➡️ מעבר לשלב השם (דרישה 3)
        return;
      }
      
      if (data.status === 'LOGIN_SUCCESS') {
        handleLoginSuccess(data);
      } else {
        showMessage('❌ קוד שגוי', 'error');
      }

    } catch (error) {
      showMessage(`❌ שגיאה: ${error.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };
  
  const saveFullName = async () => {
    const nameRegex = /^[\u0590-\u05FFa-zA-Z\s]{2,}$/;
    if (!nameRegex.test(fullNameValue.trim())) {
      showMessage('❌ שם לא תקין', 'error');
      return;
    }

    try {
      setIsLoading(true);
      
      // 🔥 קורא לנקודת הקצה החדשה לשמירת שם
      const response = await fetch(`${API_BASE_URL}/save-full-name`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          phone: phoneValue, 
          full_name: fullNameValue
        })
      });

      const data = await response.json();
      
      if (data.status === 'LOGIN_SUCCESS') {
        handleLoginSuccess(data);
      } else {
        throw new Error(data.message || 'שגיאה בשמירת השם');
      }
    } catch (error) {
      showMessage(`❌ ${error.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoginSuccess = (data) => {
    setCurrentUser((prev) => ({ 
      ...prev, 
      remainingMatches: data.remaining_matches || 30,
      isPro: data.is_premium || false,
      hoursUntilReset: data.hours_until_reset || 0,
      fullName: data.user_full_name // 🔥 שמירת השם המלא שהגיע מהשרת
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
  }

  const backToPhoneScreen = () => {
    setAuthStep('phoneScreen');
    setCodeValue('');
    showMessage('ניתן לשלוח קוד חדש', 'info');
  };
  
  const backToCodeScreen = () => {
    setAuthStep('codeScreen');
    setFullNameValue('');
    showMessage('חזרת לשלב הקוד', 'info');
  };

  // File Upload
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

  // בדיקת עמודת טלפון
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
      showMessage('📱 מבקש גישה...', 'success');

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
      
    } catch (error) {
      showMessage('❌ לא ניתן לגשת לאנשי קשר', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // פונקציה לשמירת סשן אוטומטית
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
      matches_used_in_session: matchesUsedInSession
    };
    
    await fetch(`${API_BASE_URL}/save-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sessionData)
    });
    
    console.log('✅ Session auto-saved');
  } catch (error) {
    console.error('Failed to save session:', error);
  }
};

// הפעלת שמירה אוטומטית כל דקה
useEffect(() => {
  if (currentScreen === 'matchingScreen' && matchingResults.length > 0) {
    const interval = setInterval(autoSaveSession, 60000); // כל דקה
    return () => clearInterval(interval);
  }
}, [currentScreen, matchingResults, selectedContacts, currentGuestIndex]);

// פונקציה לבדיקה וטעינת סשן קיים
const checkExistingSession = async () => {
  if (!currentUser.phone) return;
  
  try {
    setIsLoading(true);
    const response = await fetch(`${API_BASE_URL}/load-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: currentUser.phone })
    });
    
    const data = await response.json();
    
    if (data.status === 'success' && data.session_data) {
      // הצגת דיאלוג למשתמש
      setShowResumeDialog(true);
      setSavedSession(data.session_data);
    }
  } catch (error) {
    console.error('Failed to check session:', error);
  } finally {
    setIsLoading(false);
  }
};

// קריאה לבדיקת סשן אחרי התחברות
useEffect(() => {
  if (currentScreen === 'uploadScreen' && currentUser.phone) {
    checkExistingSession();
  }
}, [currentScreen, currentUser.phone]);

// קומפוננטה לדיאלוג המשך עבודה
const ResumeSessionDialog = ({ savedSession, onResume, onNewSession }) => {
  if (!savedSession) return null;
  
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
        maxWidth: '500px',
        textAlign: 'center'
      }}>
        <h2>🔄 נמצאה עבודה שמורה!</h2>
        
        <div style={{
          background: '#f1f8ff',
          padding: '15px',
          borderRadius: '10px',
          margin: '20px 0',
          textAlign: 'right'
        }}>
          <div>📅 תאריך: {new Date(savedSession.timestamp).toLocaleDateString('he-IL')}</div>
          <div>📊 התקדמות: {savedSession.current_progress}</div>
          <div>✅ התאמות שנעשו: {Object.keys(savedSession.selected_contacts || {}).length}</div>
        </div>
        
        <p style={{ fontSize: '1.1rem', marginBottom: '25px' }}>
          האם להמשיך מאיפה שהפסקת?
        </p>
        
        <div style={{ display: 'flex', gap: '15px', justifyContent: 'center' }}>
          <button 
            className="btn btn-primary"
            onClick={onResume}
          >
            ✅ המשך עבודה
          </button>
          
          <button 
            className="btn btn-secondary"
            onClick={onNewSession}
          >
            🆕 התחל מחדש
          </button>
        </div>
      </div>
    </div>
  );
};

// הוסף state חדש
const [showResumeDialog, setShowResumeDialog] = useState(false);
const [savedSession, setSavedSession] = useState(null);

// פונקציה להמשך מסשן שמור
const resumeSession = () => {
  if (!savedSession) return;
  
  // טעינת כל הנתונים מהסשן השמור
  setMatchingResults(savedSession.matching_results || []);
  setSelectedContacts(savedSession.selected_contacts || {});
  setCurrentGuestIndex(savedSession.current_guest_index || 0);
  setFileHash(savedSession.file_hash || '');
  setFilters(savedSession.filters || {});
  setSkipFilledPhones(savedSession.skip_filled_phones || false);
  setAutoSelectedCount(savedSession.auto_selected_count || 0);
  setPerfectMatchesCount(savedSession.perfect_matches_count || 0);
  setMatchesUsedInSession(savedSession.matches_used_in_session || 0);
  
  // מעבר למסך ההתאמות
  setCurrentScreen('matchingScreen');
  setShowResumeDialog(false);
  showMessage('✅ העבודה נטענה בהצלחה!', 'success');
};

// הוסף לרנדר הראשי
{showResumeDialog && (
  <ResumeSessionDialog
    savedSession={savedSession}
    onResume={resumeSession}
    onNewSession={() => {
      setShowResumeDialog(false);
      setSavedSession(null);
    }}
  />
)}


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

  // Merge
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

    // ✅ שמירה ב־GCS לפני המיזוג
    console.log("📁 שולח שמירה ל־/save-files...");
    await fetch(`${API_BASE_URL}/save-files?phone=${currentUser.phone}`, {
      method: 'POST',
      body: formData,
    });

    // ✅ עכשיו מבצע מיזוג
    const response = await fetch(`${API_BASE_URL}/merge-files`, {
      method: 'POST',
      body: formData,
    });

    if (response.status === 403) {
      const errorData = await response.json();
      if (errorData.error === 'daily_limit_exceeded') {
        showMessage(`⏰ נגמרו ההתאמות`, 'warning');
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

    if (data.warning) {
      showMessage(`⚠️ ${data.warning}`, 'warning');
    }

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


  // Select Candidate
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

  // Add Manual
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

  // Search
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

  // Next Guest - עם בדיקת מגבלה
  const nextGuest = async () => {
    // 🔥 מניעת לחיצות כפולות
    if (isProcessingRef.current) {
      console.log('⚠️ Already processing');
      return;
    }

    const currentGuest = matchingResults[currentGuestIndex];
    
    if (!selectedContacts[currentGuest.guest]) {
      showMessage('❌ אנא בחר מועמד', 'error');
      return;
    }
    
    // 1. 🔥 בדיקה אם זו ההתאמה האחרונה (30)
    // אם נותרו 1 או פחות וזה לא פרימיום.
    const isFinalMatch = !currentUser.isPro && currentUser.remainingMatches <= 1;

    if (isFinalMatch) {
      isProcessingRef.current = true;
      setIsLoading(true);
      
      // זו ההתאמה האחרונה!
      showMessage('⏰ זו ההתאמה האחרונה שלך היום! מעביר לייצוא...', 'warning');
      
      // עדכון מקומי לפני ה-Batch
      setMatchesUsedInSession(prev => prev + 1);
      setCurrentUser(prev => ({
        ...prev,
        remainingMatches: 0 // מגיע ל-0
      }));
      
      // 🚨 סיום ועדכון Batch
      const finalMatchesUsed = matchesUsedInSession + 1
      await completeSession(finalMatchesUsed);
      
      setTimeout(() => {
        // לאחר עדכון ה-DB, עוברים ישר למסך ה-Limit
        setCurrentScreen('limitReached');
        isProcessingRef.current = false;
        setIsLoading(false);
      }, 2000);
      
      return;
    }

    // 2. 🔥 מעבר רגיל למוזמן הבא (אם נותרו יותר מ-1)
    isProcessingRef.current = true;
    setIsLoading(true);

    try {
      // עדכון מקומי
      if (!currentUser.isPro) {
        setMatchesUsedInSession(prev => prev + 1);
        setCurrentUser(prev => ({
          ...prev,
          remainingMatches: Math.max(0, prev.remainingMatches - 1)
        }));
      }

      // מעבר למוזמן הבא
      const newIndex = currentGuestIndex + 1;
      if (newIndex < matchingResults.length) {
        setCurrentGuestIndex(newIndex);
      } else {
        // סיום - עדכון Batch
        await completeSession(finalMatchesUsed); // שולח את הערך הנכון
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
    }
  };

  // Complete Session - קורא בסוף
  // 🔥 Complete Session - קורא בסוף
  const completeSession = async (currentMatchesUsed) => { // מקבל את הערך המחושב
    if (!currentUser.phone || currentUser.isPro || currentMatchesUsed === 0) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/complete-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: currentUser.phone,
          matches_used: currentMatchesUsed     // משתמש בערך שקיבל
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to update');
      }
      
      const data = await response.json();
      console.log(`✅ Session completed: ${currentMatchesUsed} matches used, ${data.remaining_matches} remaining`);
      
    } catch (error) {
      console.error('❌ Complete session error:', error);
    }
  };

  // Export - עם skip_filled
  const exportResults = async () => {
    try {
      setIsLoading(true);
      showMessage('📄 מכין קובץ...', 'success');

      await completeSession(matchesUsedInSession);

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

  // Payment
  const payWithWhatsApp = () => {
    showMessage('מפנה לוואטסאפ...', 'success');
    
    const message = `שלום! אני רוצה לשדרג לפרימיום (39₪)
📱 טלפון: ${currentUser.phone}
👤 שם: ${currentUser.fullName}
📊 מוזמנים: ${matchingResults.length}
    
תודה!`;
    
    const whatsappURL = `https://wa.me/972507676706?text=${encodeURIComponent(message)}`;
    window.open(whatsappURL, '_blank');
    
    checkPaymentStatus();
  };

  const checkPaymentStatus = () => {
    showMessage('🔄 בודק תשלום...', 'success');
    
    const checkInterval = setInterval(async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/check-payment-status/${currentUser.phone}`);
        
        if (response.ok) {
          const data = await response.json();
          
          if (data.is_premium) {
            clearInterval(checkInterval);
            setCurrentUser((prev) => ({ ...prev, isPro: true, remainingMatches: 999999 }));
            showMessage('🎉 תשלום הושלם! אתה Pro!', 'success');
            setTimeout(() => setCurrentScreen('matchingScreen'), 2000);
          }
        }
      } catch (error) {
        console.error('Error checking payment:', error);
      }
    }, 5000);

    setTimeout(() => {
      clearInterval(checkInterval);
    }, 300000);
  };

  // Filters
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
  
  // Loading Screen
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

  // RENDER
  return (
    <div className="app-container">
      <div className="content-card">
        
        {/* Landing Page */}
        {currentScreen === 'landingPage' && (
          <LandingPage onStart={() => setCurrentScreen('authScreen')} />
        )}

        {/* Auth Screen (Combined for all 3 steps) */}
        {currentScreen === 'authScreen' && (
          <AuthScreen
            authStep={authStep}
            phoneValue={phoneValue}
            setPhoneValue={setPhoneValue}
            fullNameValue={fullNameValue}
            setFullNameValue={setFullNameValue}
            codeValue={codeValue}
            setCodeValue={setCodeValue}
            isLoading={isLoading}
            sendCode={sendCode}
            verifyCode={verifyCode}
            saveFullName={saveFullName}
            backToPhoneScreen={backToPhoneScreen}
            backToCodeScreen={backToCodeScreen}
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
                const filteredResults = getFilteredResults();
                const currentGuest = filteredResults[currentGuestIndex] || matchingResults[currentGuestIndex];
                
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
              setMatchesUsedInSession(0);
              setSkipFilledPhones(false);
              setPhoneColumnInfo(null);
              setShowPhoneColumnDialog(false);
              setCurrentScreen('uploadScreen'); 
            }}
          />
        )}

        {/* Contacts Guide Modal */}
        {showContactsGuide && (
          <ContactsGuideModal onClose={() => setShowContactsGuide(false)} />
        )}

        {/* Phone Column Dialog */}
        {showPhoneColumnDialog && phoneColumnInfo && (
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
              maxWidth: '500px',
              textAlign: 'center'
            }}>
              <h3 style={{ marginBottom: '20px' }}>📞 מצאנו עמודת טלפון בקובץ!</h3>
              
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