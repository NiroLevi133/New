import React from 'react';

const LimitDisplay = ({ currentUser, DAILY_LIMIT }) => {
  if (currentUser.isPro) {
    return (
      <div className="limit-badge pro">
        💎 פרימיום - ללא הגבלה
      </div>
    );
  }
  
  const remaining = currentUser.remainingMatches || 0;
  const percentage = (remaining / DAILY_LIMIT) * 100;
  
  // פונקציה מקומית קצרה להצגת שעות (לשם הדגמה)
  const formatTime = (hours) => {
    if (hours <= 0) return "אופס!";
    const h = Math.floor(hours);
    const m = Math.floor((hours * 60) % 60);
    if (h > 0) return `${h} שעות ו-${m} דקות`;
    return `${m} דקות`;
  };

  return (
    <div className={`limit-badge ${remaining <= 5 ? 'urgent' : ''}`}>
      <div className="limit-bar">
        <div 
          className="limit-fill" 
          style={{ 
            width: `${percentage}%`,
            background: remaining <= 5 ? '#dc3545' : '#28a745'
          }}
        />
      </div>
      <div className="limit-text">
        {DAILY_LIMIT - remaining}/{DAILY_LIMIT} התאמות
        {remaining > 0 && ` · נותרו ${remaining}`}
      </div>
      {remaining <= 0 && currentUser.hoursUntilReset > 0 && (
        <div className="reset-timer">
          איפוס בעוד {formatTime(currentUser.hoursUntilReset)}
        </div>
      )}
    </div>
  );
};

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
  API_BASE_URL
}) => {
  return (
    <div>
      <h2>📁 העלה את הקבצים שלך</h2>
      
      <LimitDisplay currentUser={currentUser} DAILY_LIMIT={DAILY_LIMIT} />
      
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
            ✅ קובץ אנשי קשר נטען
          </div>
        )}
      </div>

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
  );
};

const MatchingSidebar = ({
  currentUser,
  DAILY_LIMIT,
  exportResults,
  isLoading,
  currentGuestIndex,
  filters,
  setFilters,
  getUniqueValues,
  onUpgradeClick
}) => {
  return (
    <div className="sidebar">
      <div className="sidebar-section">
        <div className="sidebar-title">📥 ייצוא</div>
        <button 
          className="btn btn-primary btn-sidebar"
          onClick={exportResults}
          disabled={isLoading || currentGuestIndex === 0}
        >
          {isLoading ? '⏳ מייצא...' : '📥 הורד'}
        </button>
        <div style={{ fontSize: '0.8rem', color: '#666', textAlign: 'center', marginTop: '8px' }}>
          {currentGuestIndex + 1} מוזמנים מעובדים
        </div>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-title">🔍 פילטרים</div>
        
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
          <div className="sidebar-title">💎 מגבלה</div>
          <LimitDisplay currentUser={currentUser} DAILY_LIMIT={DAILY_LIMIT} />
          <button 
            className="btn btn-primary btn-sidebar"
            onClick={onUpgradeClick}
            style={{ marginTop: '10px' }}
          >
            💎 שדרג עכשיו
          </button>
        </div>
      )}
    </div>
  );
};

const GuestCard = ({ 
  currentGuest, 
  currentGuestIndex, 
  totalGuests,
  selectedContacts,
  selectCandidate,
  showAddContact,
  setShowAddContact,
  manualPhone,
  setManualPhone,
  addManualContact,
  searchInContacts,
  handleSearchInput,
  showSuggestions,
  searchSuggestions,
  selectFromSuggestion,
  setSearchInContacts,
  setShowSuggestions
}) => {
  const guestDetails = currentGuest.guest_details || {};
  const isSelected = !!selectedContacts[currentGuest.guest];
  const selectedCandidate = selectedContacts[currentGuest.guest];

  return (
    <>
\

      <div className="guest-card">
        <div className="guest-header">
          <div className="guest-name">{currentGuest.guest}</div>
          <div className="guest-progress">
            {currentGuestIndex + 1} / {totalGuests}
          </div>
        </div>

        {Object.keys(guestDetails).length > 0 && (
          <div className="guest-details">
            {Object.entries(guestDetails).map(([key, value]) => (
              <div key={key} className="detail-item">
                <div className="detail-label">{key}</div>
                <div className="detail-value">{value}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: '20px' }}>
        <h3 style={{ textAlign: 'center', marginBottom: '15px' }}>
          {currentGuest.candidates?.length > 0 
            ? `📋 מצאנו ${currentGuest.candidates.length} מועמדים:` 
            : '❌ לא נמצאו מועמדים'}
        </h3>

        {currentGuest.candidates?.map((candidate, idx) => {
          const isThisSelected = selectedCandidate?.phone === candidate.phone;
          
          return (
            <div
              key={idx}
              className={`candidate-card ${isThisSelected ? 'selected' : ''}`}
              onClick={() => selectCandidate(candidate)}
              style={{ cursor: 'pointer' }}
            >
              <div className="candidate-info">
                <div className="candidate-name">
                  {isThisSelected && '✅ '}{candidate.name}
                </div>
                <div className="candidate-phone">{candidate.phone}</div>
                {candidate.reason && (
                  <div style={{ fontSize: '0.8rem', color: '#999', marginTop: '3px' }}>
                    {candidate.reason}
                  </div>
                )}
              </div>
              {/* 🛑 הוסר: <div className="candidate-score">{candidate.score}%</div> */}
            </div>
          );
        })}

        <div 
          className={`candidate-card ${selectedCandidate?.isNotFound ? 'selected' : ''}`}
          onClick={() => selectCandidate({ isNotFound: true, name: 'לא נמצא', phone: '', score: 0 })}
          style={{ 
            marginTop: '15px',
            background: selectedCandidate?.isNotFound ? '#fff3cd' : '#f8f9fa',
            cursor: 'pointer'
          }}
        >
          <div className="candidate-info">
            <div className="candidate-name">
              {selectedCandidate?.isNotFound && '✅ '}🚫 לא נמצא באנשי הקשר
            </div>
          </div>
        </div>

        {!showAddContact ? (
          <button 
            className="btn btn-secondary btn-small"
            onClick={() => setShowAddContact(true)}
            style={{ marginTop: '15px', width: '100%' }}
          >
            ➕ הוסף מספר ידנית
          </button>
        ) : (
          <div style={{ 
            marginTop: '15px', 
            padding: '15px', 
            background: '#f8f9fa', 
            borderRadius: '10px' 
          }}>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="🔍 חפש באנשי קשר..."
                value={searchInContacts}
                onChange={(e) => handleSearchInput(e.target.value)}
                style={{ marginBottom: '10px' }}
              />
              
              {showSuggestions && searchSuggestions.length > 0 && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  background: 'white',
                  border: '2px solid #e1e8ed',
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
                      style={{
                        padding: '10px 15px',
                        cursor: 'pointer',
                        borderBottom: idx < searchSuggestions.length - 1 ? '1px solid #e1e8ed' : 'none',
                        transition: 'background 0.2s'
                      }}
                      onMouseEnter={(e) => e.target.style.background = '#f0f0f0'}
                      onMouseLeave={(e) => e.target.style.background = 'white'}
                    >
                      <div style={{ fontWeight: '600' }}>{contact.name}</div>
                      <div style={{ fontSize: '0.85rem', color: '#666' }}>{contact.phone}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <input
              type="tel"
              placeholder="או הזן מספר טלפון..."
              value={manualPhone}
              onChange={(e) => setManualPhone(e.target.value)}
              style={{ marginBottom: '10px' }}
            />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                className="btn btn-primary btn-small"
                onClick={addManualContact}
                style={{ flex: 1 }}
              >
                ✅ הוסף
              </button>
              <button 
                className="btn btn-secondary btn-small"
                onClick={() => {
                  setShowAddContact(false);
                  setManualPhone('');
                  setSearchInContacts('');
                  setShowSuggestions(false);
                }}
                style={{ flex: 1 }}
              >
                ❌ ביטול
              </button>
            </div>
          </div>
        )}
      </div>

      {!isSelected && (
        <div style={{
          marginTop: '15px',
          padding: '12px',
          background: '#fff3cd',
          borderRadius: '8px',
          textAlign: 'center',
          fontSize: '0.9rem',
          color: '#856404'
        }}>
          ⚠️ בחר מועמד או סמן "לא נמצא" כדי להמשיך
        </div>
      )}
    </>
  );
};

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
      <h2>🎉 כל הכבוד! סיימת!</h2>
      <div style={{ fontSize: '3rem', margin: '20px 0' }}>✨</div>
      <p>עיבדת בהצלחה {currentGuestIndex + 1} מוזמנים!</p>
      
      {autoSelectedCount > 0 && (
        <div className="perfect-match-badge">
          🎯 {autoSelectedCount} התאמות אוטומטיות (93%+)
        </div>
      )}
      
      {perfectMatchesCount > 0 && (
        <div className="perfect-match-badge" style={{ background: 'linear-gradient(135deg, #ffd700, #ffed4e)' }}>
          💯 {perfectMatchesCount} התאמות מושלמות (100%)
        </div>
      )}
      
      <div style={{ 
        background: 'linear-gradient(135deg, rgba(42, 157, 143, 0.1), rgba(244, 162, 97, 0.1))', 
        padding: '20px', 
        borderRadius: '15px', 
        margin: '30px 0' 
      }}>
        <h3>📥 מה הלאה?</h3>
        <p>הורד את קובץ התוצאות עם מספרי הטלפון!</p>
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
          🔄 התחל מחדש
        </button>
      </div>
    </div>
  );
};

export { 
  LimitDisplay, 
  UploadScreen, 
  MatchingSidebar, 
  GuestCard, 
  SuccessScreen 
};