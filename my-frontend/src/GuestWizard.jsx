import React, { useState } from 'react';
import './GuestWizard.css';

const GuestWizard = ({ results }) => {
  const [currentGuestIndex, setCurrentGuestIndex] = useState(0);
  const [finalChoices, setFinalChoices] = useState({});
  const [selectedContact, setSelectedContact] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [filteredCandidates, setFilteredCandidates] = useState([]);
  const [message, setMessage] = useState({ text: '', type: '' });

  const currentGuest = results[currentGuestIndex];
  const totalGuests = results.length;
  const isLastGuest = currentGuestIndex === totalGuests - 1;

  React.useEffect(() => {
    if (currentGuest) {
      setFilteredCandidates(currentGuest.candidates || []);
      setSelectedContact(null);
      setSearchTerm('');
      setManualPhone('');
    }
  }, [currentGuestIndex, currentGuest]);

  // חיפוש במועמדים
  const handleSearch = (value) => {
    setSearchTerm(value);
    if (!value.trim()) {
      setFilteredCandidates(currentGuest.candidates || []);
      return;
    }
    
    const filtered = (currentGuest.candidates || []).filter(candidate => 
      candidate.name.toLowerCase().includes(value.toLowerCase()) ||
      candidate.phone.toLowerCase().includes(value.toLowerCase())
    );
    setFilteredCandidates(filtered);
  };

  // בחירת מועמד
  const selectCandidate = (candidate) => {
    setSelectedContact(candidate);
  };

  // הוספת מספר ידני
  const addManualPhone = () => {
    if (manualPhone.trim().length >= 10) {
      const newCandidate = {
        name: '📞 מספר שהוספת ידנית',
        phone: manualPhone.trim(),
        score: 1.0,
        reason: 'הוסף ידנית',
        isManual: true
      };
      
      setFilteredCandidates([newCandidate, ...filteredCandidates]);
      selectCandidate(newCandidate);
      setManualPhone('');
      showMessage('✅ מספר טלפון נוסף בהצלחה!', 'success');
    } else {
      showMessage('❌ אנא הזן מספר טלפון תקין (לפחות 10 ספרות)', 'error');
    }
  };

  // בחירת "לא נמצא"
  const selectNotFound = () => {
    setSelectedContact({ 
      name: 'לא נמצא איש קשר מתאים', 
      phone: '', 
      score: 0, 
      reason: 'לא נמצא',
      isNotFound: true 
    });
  };

  // הצגת הודעה
  const showMessage = (text, type) => {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: '', type: '' }), 3000);
  };

  // אישור והמשך
  const handleNextGuest = () => {
    if (!selectedContact) {
      showMessage('❌ אנא בחר איש קשר או סמן "לא נמצא"', 'error');
      return;
    }

    // שמור את הבחירה
    setFinalChoices(prev => ({
      ...prev,
      [currentGuest.guest_name]: selectedContact
    }));

    if (isLastGuest) {
      // סיום - הצג סיכום
      showMessage('🎉 סיימת את כל המוזמנים!', 'success');
      console.log('בחירות סופיות:', {
        ...finalChoices,
        [currentGuest.guest_name]: selectedContact
      });
    } else {
      // עבור למוזמן הבא
      setCurrentGuestIndex(prev => prev + 1);
    }
  };

  // חזרה למוזמן הקודם
  const handlePreviousGuest = () => {
    if (currentGuestIndex > 0) {
      setCurrentGuestIndex(prev => prev - 1);
    }
  };

  if (!currentGuest) {
    return (
      <div className="wizard-container">
        <div className="completion-message">
          <h2>🎉 סיימת את כל המוזמנים!</h2>
          <p>כל ההתאמות נשמרו בהצלחה</p>
        </div>
      </div>
    );
  }

  return (
    <div className="wizard-container">
      {/* Progress Bar */}
      <div className="progress-section">
        <div className="progress-bar">
          <div 
            className="progress-fill" 
            style={{width: `${((currentGuestIndex + 1) / totalGuests) * 100}%`}}
          ></div>
        </div>
        <div className="progress-text">
          מוזמן {currentGuestIndex + 1} מתוך {totalGuests}
        </div>
      </div>

      {/* פרופיל מוזמן */}
      <div className="guest-profile">
        <h3 className="guest-name">👰 {currentGuest.guest_name}</h3>
        
        <div className="guest-details">
          <div className="detail-item">
            <div className="detail-label">ציון התאמה</div>
            <div className="detail-value">
              {currentGuest.best_match_score ? 
                `${Math.round(currentGuest.best_match_score * 100)}%` : 
                'לא נמצאה התאמה'
              }
            </div>
          </div>
          <div className="detail-item">
            <div className="detail-label">מועמדים</div>
            <div className="detail-value">{currentGuest.candidates?.length || 0}</div>
          </div>
          <div className="detail-item">
            <div className="detail-label">סטטוס</div>
            <div className="detail-value">
              {selectedContact ? '✅ נבחר' : '⏳ ממתין'}
            </div>
          </div>
        </div>
      </div>

      {/* אפשרויות התאמה */}
      <div className="contact-options">
        <h3 className="options-title">🔍 בחר איש קשר מתאים</h3>
        
        {/* חיפוש במועמדים */}
        <div className="search-section">
          <div className="section-title">🔎 חיפוש במועמדים</div>
          <input 
            type="text" 
            className="search-input" 
            placeholder="חפש לפי שם או טלפון..." 
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>
        
        {/* הוספת מספר ידני */}
        <div className="manual-phone-section">
          <div className="section-title">📞 הוסף מספר טלפון ידני</div>
          <input 
            type="tel" 
            className="manual-phone-input" 
            placeholder="05X-XXXXXXX" 
            value={manualPhone}
            onChange={(e) => setManualPhone(e.target.value.replace(/[^\d-]/g, ''))}
          />
          <button 
            className="btn btn-small" 
            style={{marginTop: '8px', fontSize: '0.8rem'}} 
            onClick={addManualPhone}
          >
            ➕ הוסף
          </button>
        </div>
        
        {/* הודעות */}
        {message.text && (
          <div className={`status-message status-${message.type}`}>
            {message.text}
          </div>
        )}
        
        {/* רשימת מועמדים */}
        <div className="section-title">👥 מועמדים אפשריים</div>
        <div className="option-group">
          {filteredCandidates.map((candidate, index) => (
            <div 
              key={index}
              className={`radio-option ${selectedContact?.name === candidate.name && selectedContact?.phone === candidate.phone ? 'selected' : ''}`}
              onClick={() => selectCandidate(candidate)}
            >
              <div className="radio-label">
                <div className="contact-name">{candidate.name}</div>
                <div className="contact-phone">
                  {candidate.phone} 
                  {candidate.score && (
                    <span className="match-score">
                      • {Math.round(candidate.score * 100)}% התאמה
                    </span>
                  )}
                </div>
                {candidate.reason && (
                  <div className="contact-reason">{candidate.reason}</div>
                )}
              </div>
              <input 
                type="radio" 
                name="contactMatch" 
                className="radio-input"
                checked={selectedContact?.name === candidate.name && selectedContact?.phone === candidate.phone}
                onChange={() => selectCandidate(candidate)}
              />
            </div>
          ))}
          
          {/* אופציה "לא נמצא" */}
          <div 
            className={`radio-option ${selectedContact?.isNotFound ? 'selected' : ''}`}
            onClick={selectNotFound}
          >
            <div className="radio-label">
              <div className="contact-name">❌ לא נמצא איש קשר מתאים</div>
              <div className="contact-phone">יישאר ללא מספר טלפון</div>
            </div>
            <input 
              type="radio" 
              name="contactMatch" 
              className="radio-input"
              checked={selectedContact?.isNotFound || false}
              onChange={selectNotFound}
            />
          </div>
        </div>

        {/* כפתורי ניווט */}
        <div className="navigation-buttons">
          {currentGuestIndex > 0 && (
            <button className="btn btn-secondary" onClick={handlePreviousGuest}>
              ⬅️ המוזמן הקודם
            </button>
          )}
          <button 
            className="btn btn-primary" 
            onClick={handleNextGuest}
            disabled={!selectedContact}
          >
            {isLastGuest ? '🎉 סיים' : '➡️ המוזמן הבא'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default GuestWizard;