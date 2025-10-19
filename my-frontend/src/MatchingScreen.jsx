import React from 'react';

// ============================================================
// 1. LimitDisplay
// ============================================================
const LimitDisplay = ({ currentUser, DAILY_LIMIT, onUpgradeClick }) => {
  if (currentUser.isPro) {
    return (
      <div className="limit-badge pro" onClick={onUpgradeClick} style={{ cursor: 'pointer' }}>
        💎 פרימיום - ללא הגבלה
      </div>
    );
  }
  
  const remaining = currentUser.remainingMatches || 0;
  
  return (
    <div className={`limit-badge ${remaining <= 5 ? 'urgent' : ''}`} onClick={onUpgradeClick} style={{ cursor: 'pointer' }}>
      <div className="limit-text">
        נותרו: {remaining}/{DAILY_LIMIT} התאמות
      </div>
      {remaining <= 0 && (
        <span style={{ marginRight: '5px' }}>
            (אופס!)
        </span>
      )}
    </div>
  );
};

// ============================================================
// 2. UploadScreen
// ============================================================
const UploadScreen = ({
  currentUser,
  DAILY_LIMIT,
  uploadedFiles,
  handleFileUpload,
  supportsMobileContacts,
  requestMobileContacts,
  isLoading,
  startMerge,
  setShowContactsGuide,
  API_BASE_URL,
  onUpgradeClick
}) => {
  
  const isContactsFile = uploadedFiles.contacts !== null && uploadedFiles.contacts !== 'mobile_contacts';
  const isMobileContacts = uploadedFiles.contacts === 'mobile_contacts';

  return (
    <div>
      <div className="app-header-status">
        <h2>📁 העלאת הקבצים שלך</h2>
        <LimitDisplay currentUser={currentUser} DAILY_LIMIT={DAILY_LIMIT} onUpgradeClick={onUpgradeClick} />
      </div>
      
      <p style={{ textAlign: 'center', color: '#555', marginBottom: '25px' }}>
        שלב 1 מתוך 2: העלה את שני הקבצים כדי להתחיל במיזוג.
      </p>

      {/* העלאת אנשי קשר */}
      <div className="file-upload-section">
        <div className="file-upload-title">
          <label>📞 קובץ אנשי קשר</label>
          <button 
            className="btn btn-secondary btn-small"
            onClick={() => setShowContactsGuide(true)}
            type="button"
          >
            📋 איך להוציא אנשי קשר?
          </button>
        </div>

        {supportsMobileContacts && (
          <button 
            className="btn btn-secondary btn-small"
            onClick={requestMobileContacts}
            disabled={isLoading || isContactsFile || isMobileContacts}
            style={{ width: '100%', marginBottom: '10px' }}
          >
            {isMobileContacts ? '✅ נטענו אנשי קשר מהטלפון' : '📱 גישה לאנשי קשר בטלפון'}
          </button>
        )}
        
        {supportsMobileContacts && (
            <div style={{ textAlign: 'center', margin: '5px 0', color: '#888', fontSize: '0.9rem' }}>
              {isMobileContacts ? 'או' : 'או העלה קובץ'}
            </div>
        )}

        <input 
          type="file" 
          accept=".csv,.xlsx,.xls"
          onChange={(e) => handleFileUpload(e, 'contacts')}
          disabled={isLoading || isMobileContacts}
        />
        {(isContactsFile || isMobileContacts) && (
          <div className={`status-message status-success`} style={{ marginTop: '10px' }}>
            ✅ {isMobileContacts ? 'אנשי קשר מהטלפון נטענו' : 'קובץ אנשי קשר נטען'}
          </div>
        )}
      </div>

      {/* העלאת מוזמנים */}
      <div className="file-upload-section">
        <div className="file-upload-title">
          <label>👰 קובץ מוזמנים</label>
        </div>
        
        <input 
          type="file" 
          accept=".csv,.xlsx,.xls" 
          onChange={(e) => handleFileUpload(e, 'guests')}
          disabled={isLoading}
        />
        {uploadedFiles.guests && (
          <div className={`status-message status-success`} style={{ marginTop: '10px' }}>
            ✅ קובץ מוזמנים נטען
          </div>
        )}
      </div>

      <button 
        className="btn btn-primary" 
        onClick={startMerge}
        disabled={!uploadedFiles.guests || !uploadedFiles.contacts || isLoading}
        style={{ width: '100%', fontSize: '1.2rem', padding: '18px 40px', marginTop: '20px' }}
      >
        {isLoading ? '⏳ טוען...' : '🚀 התחל מיזוג והתאמה'}
      </button>
      
      <div style={{ marginTop: '25px', textAlign: 'center', borderTop: '1px solid #eee', paddingTop: '20px' }}>
        <p style={{ fontWeight: '600' }}>💡 צריך עזרה? הורד קבצי דוגמה:</p>
        <div style={{ display: 'flex', gap: '15px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button 
            className="btn btn-secondary btn-small" 
            onClick={() => window.open(`${API_BASE_URL}/download-guests-template`, '_blank')}
          >
            📥 דוגמה - מוזמנים
          </button>
          <button 
            className="btn btn-secondary btn-small" 
            onClick={() => window.open(`${API_BASE_URL}/download-contacts-template`, '_blank')}
          >
            📥 דוגמה - אנשי קשר
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// 3. GuestCard
// ============================================================
const GuestCard = ({ 
  currentGuest, 
  currentGuestIndex, 
  totalGuests,
  selectedContacts,
  selectCandidate,
  manualPhone,
  setManualPhone,
  addManualContact,
  searchInContacts,
  handleSearchInput,
  showSuggestions,
  searchSuggestions,
  selectFromSuggestion,
  nextGuest, 
  previousGuest 
}) => {
  const guestDetails = currentGuest.guest_details || {};
  const isSelected = !!selectedContacts[currentGuest.guest];
  const selectedCandidate = selectedContacts[currentGuest.guest];

  // 🔥 מיון מועמדים - בראש: 100%, 93%+, ואז השאר.
  const sortedCandidates = (currentGuest.candidates || []).sort((a, b) => b.score - a.score);

  return (
    <>
      <div className="guest-card-container">
        
        <div className="guest-header">
          <div className="guest-progress">
            מוזמן: {currentGuestIndex + 1} / {totalGuests}
          </div>
        </div>
        
        <div className="guest-name">
            {currentGuest.best_score === 100 && '👑 '}
            {currentGuest.guest}
        </div>
        
        {/* פרטים חכמים (צד, קבוצה) - מוצגים בצורה דיסקרטית */}
        <div className="guest-details-smart">
          {Object.entries(guestDetails).map(([key, value]) => (
            <div key={key} className="smart-detail-item">
              <strong>{key}:</strong> {value}
            </div>
          ))}
        </div>

        
        <h3 style={{ textAlign: 'center', marginBottom: '15px' }}>
          {currentGuest.best_score >= 93 && currentGuest.best_score < 100 ? '✅ המלצת המערכת (93%+)' : '📋 בחר איש קשר מתאים:'}
        </h3>

        {/* רשימת מועמדים - שימוש ב-candidate-option מעוצב */}
        <div className="candidates-list">
          {sortedCandidates.map((candidate, idx) => {
            const isThisSelected = selectedCandidate?.phone === candidate.phone;
            const isAutoSelected = candidate.score >= 93 && currentGuest.best_score < 100; // רק אם לא 100%
            
            return (
              <div
                key={idx}
                className={`candidate-option ${isThisSelected ? 'selected' : ''}`}
                onClick={() => selectCandidate(candidate)}
              >
                <div className="candidate-info">
                  <div className="contact-name">
                    {isAutoSelected && <span className="auto-match-badge">התאמה גבוהה</span>}
                    {candidate.name}
                  </div>
                  <div className="contact-phone">
                    {candidate.phone}
                  </div>
                  {candidate.reason && (
                    <div className="contact-phone" style={{fontSize: '0.8rem'}}>
                      {candidate.reason}
                    </div>
                  )}
                </div>
                {/* ציון - מוצג בצד למידע נוסף */}
                <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: isAutoSelected ? 'var(--warning-yellow)' : '#666' }}>
                    {candidate.score}%
                </div>
              </div>
            );
          })}
        </div>

        {/* אפשרות "לא נמצא" - ככפתור ברור */}
        <div 
          className={`candidate-option ${selectedCandidate?.isNotFound ? 'selected' : ''}`}
          onClick={() => selectCandidate({ isNotFound: true, name: '🚫 לא נמצא', phone: '', score: 0 })}
          style={{ 
            marginTop: '15px',
            background: selectedCandidate?.isNotFound ? '#ffebeb' : '#f8f9fa',
            borderColor: selectedCandidate?.isNotFound ? 'var(--danger-red)' : '#ddd',
            fontWeight: 'normal'
          }}
        >
          <div className="candidate-info">
            <div className="contact-name">
              🚫 המוזמן לא נמצא באנשי הקשר שלי
            </div>
            <div className="contact-phone">
              סמן אם ברצונך להשאיר את המספר ריק
            </div>
          </div>
        </div>
      </div>
      
      {/* 4. הוספה ידנית / חיפוש - תמיד גלוי כעת */}
      <div style={{ 
            padding: '15px', 
            background: 'var(--light-gray)', 
            borderRadius: '10px',
            marginBottom: '20px'
          }}>
        <h3 style={{marginTop: 0, marginBottom: '15px', fontSize: '1.1rem', textAlign: 'center'}}>
          או חפש / הוסף מספר באופן ידני:
        </h3>
        
        <div style={{ position: 'relative' }}>
            <input
                type="text"
                placeholder="🔍 חפש שם או הזן מספר טלפון..."
                value={searchInContacts}
                onChange={(e) => {
                    handleSearchInput(e.target.value);
                    setManualPhone(e.target.value.replace(/[^\d]/g, '')); // עדכן מספר ידני תוך כדי
                }}
            />
            
            {showSuggestions && searchSuggestions.length > 0 && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  background: 'white',
                  border: '1px solid var(--primary-teal)',
                  borderRadius: '10px',
                  marginTop: '5px',
                  zIndex: 1000,
                  maxHeight: '200px',
                  overflowY: 'auto',
                  boxShadow: '0 4px 15px rgba(0,0,0,0.1)'
                }}>
                  {searchSuggestions.map((contact, idx) => (
                    <div
                      key={idx}
                      onClick={() => selectFromSuggestion(contact)}
                      className="candidate-option"
                      style={{
                        padding: '10px 15px',
                        border: 'none',
                        borderRadius: 0,
                        backgroundColor: 'white',
                      }}
                    >
                      <div style={{ fontWeight: '600' }}>{contact.name}</div>
                      <div style={{ fontSize: '0.85rem', color: '#666' }}>{contact.phone}</div>
                    </div>
                  ))}
                </div>
            )}
        </div>

        {/* כפתור הוספה ידנית - מופיע רק אם יש טלפון תקין */}
        {manualPhone && manualPhone.length >= 9 && !showSuggestions && (
            <button 
                className="btn btn-secondary btn-small"
                onClick={addManualContact}
                style={{ width: '100%', marginTop: '10px' }}
            >
                ➕ הוסף מספר ידני: {manualPhone}
            </button>
        )}
      </div>

      
      {/* 5. כפתורי ניווט - מחוברים בתחתית (הכפתורים היחידים שנשארו) */}

    </>
  );
};

// ============================================================
// 4. SuccessScreen
// ============================================================
const SuccessScreen = ({ 
  currentGuestIndex, 
  autoSelectedCount,
  perfectMatchesCount,
  exportResults,
  isLoading,
  onRestart
}) => {
  return (
    <div style={{ textAlign: 'center' }}>
      <h2>🎉 משימת האימות הושלמה!</h2>
      <div style={{ fontSize: '3rem', margin: '20px 0' }}>✨</div>
      <p>עיבדת בהצלחה {currentGuestIndex + 1} מוזמנים!</p>
      
      {perfectMatchesCount > 0 && (
        <div className="perfect-match-badge" style={{ margin: '10px auto' }}>
          👑 {perfectMatchesCount} התאמות מושלמות (100%)
        </div>
      )}

      {autoSelectedCount > 0 && (
        <div style={{ fontSize: '1.1rem', color: '#2a9d8f', fontWeight: 'bold', margin: '10px 0' }}>
          ✨ {autoSelectedCount} התאמות אוטומטיות שאושרו
        </div>
      )}
      
      <div style={{ 
        background: 'rgba(42, 157, 143, 0.1)', 
        padding: '20px', 
        borderRadius: '15px', 
        margin: '30px 0' 
      }}>
        <h3>📥 מה עכשיו?</h3>
        <p>הורד את קובץ התוצאות המעודכן, הכולל את כל המספרים שאומתו.</p>
      </div>
      
      <button 
        className="btn btn-primary"
        onClick={exportResults}
        disabled={isLoading}
        style={{ fontSize: '1.2rem', padding: '20px 40px' }}
      >
        {isLoading ? '⏳ מכין קובץ...' : '📥 הורד את התוצאות'}
      </button>
      
      <div style={{ marginTop: '20px' }}>
        <button 
          className="btn btn-secondary"
          onClick={onRestart}
        >
          🔄 התחל מחדש (העלאת קובץ נוסף)
        </button>
      </div>
    </div>
  );
};

// ============================================================
// 5. Exports
// ============================================================
const MatchingSidebar = () => null;

export { 
  LimitDisplay, 
  UploadScreen, 
  MatchingSidebar, 
  GuestCard, 
  SuccessScreen 
};