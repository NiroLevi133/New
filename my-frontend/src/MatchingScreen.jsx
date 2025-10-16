import React, { useState } from 'react';

// ============================================================
// Display Limit Component 
// ============================================================
export const LimitDisplay = ({ currentUser, DAILY_LIMIT, onUpgradeClick }) => {
  if (currentUser.isPro) {
    return (
      <div className="limit-badge pro">
        💎 פרימיום - ללא הגבלה
      </div>
    );
  }
  
  const remaining = currentUser.remainingMatches || 0;
  const percentage = ((DAILY_LIMIT - remaining) / DAILY_LIMIT) * 100;
  
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
        <br />
        {remaining > 0 ? (
            <span style={{fontWeight: 'bold'}}>נותרו: {remaining} התאמות</span>
        ) : (
            <span style={{fontWeight: 'bold', color: '#dc3545'}}>
                איפוס בעוד {formatTime(currentUser.hoursUntilReset)}
            </span>
        )}
      </div>
      
      {!currentUser.isPro && remaining <= 5 && (
        <button 
          className="btn-upgrade" 
          onClick={onUpgradeClick}
        >
          שדרג עכשיו 🚀
        </button>
      )}
    </div>
  );
};

// ============================================================
// Upload Screen Component
// ============================================================
export const UploadScreen = ({
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

// ============================================================
// Sidebar Component
// ============================================================
export const MatchingSidebar = ({ 
  currentUser, DAILY_LIMIT, exportResults, isLoading, currentGuestIndex,
  filters, setFilters, getUniqueValues, onUpgradeClick
}) => {
    
    const filterFields = [
        { key: 'צד', label: 'צד' },
        { key: 'קבוצה', label: 'קבוצה / קטגוריה' }
    ];

    const totalGuestsProcessed = currentGuestIndex;
    const isCompleted = totalGuestsProcessed >= 0;

    return (
        <div className="sidebar">
            <LimitDisplay 
              currentUser={currentUser} 
              DAILY_LIMIT={DAILY_LIMIT}
              onUpgradeClick={onUpgradeClick}
            />
            
            <h3>🔍 סינון מתקדם</h3>
            <div className="filters-container">
                {filterFields.map(field => {
                    const uniqueValues = getUniqueValues ? getUniqueValues(field.key) : [];
                    if (uniqueValues.length === 0) return null;

                    return (
                        <div key={field.key} className="filter-group">
                            <label>{field.label}:</label>
                            <select 
                                value={filters[field.key.toLowerCase()] || ''}
                                onChange={(e) => setFilters(prev => ({ 
                                    ...prev, 
                                    [field.key.toLowerCase()]: e.target.value 
                                }))}
                            >
                                <option value="">הצג הכל</option>
                                {uniqueValues.map(value => (
                                    <option key={value} value={value}>
                                        {value}
                                    </option>
                                ))}
                            </select>
                        </div>
                    );
                })}
            </div>
            
            <div className="sidebar-stats">
                <h3>📊 סטטוס עיבוד</h3>
                <p>
                    {isCompleted ? (
                        <>
                            <strong>מוזמן נוכחי:</strong> {totalGuestsProcessed + 1}
                            <br/>
                            <span style={{ fontSize: '0.85rem', color: '#666' }}>
                                (הייצוא יכלול את כל הבחירות עד כה)
                            </span>
                        </>
                    ) : (
                        <span>
                            טרם החל עיבוד.
                        </span>
                    )}
                </p>
            </div>
            
            <button 
              className="btn btn-secondary" 
              onClick={exportResults}
              disabled={isLoading || !isCompleted}
              style={{ marginTop: '20px' }}
            >
              📥 ייצא תוצאות
            </button>
        </div>
    );
};

// ============================================================
// CORE LOGIC: Helper to extract Smart Details (פתרון לשמות עמודות משתנים)
// ============================================================
const getSmartDetails = (details) => {
    // מפת שדות חכמה - מחפשת את אחד מהשמות ברשימה
    const fieldMap = [
        // חיפוש עמודת "צד"
        { label: 'צד', keys: ['צד', 'side', 'חתן', 'כלה', 'צד הכלה', 'צד החתן'] },
        // חיפוש עמודת "קבוצה"
        { label: 'קבוצה', keys: ['קבוצה', 'group', 'קטגוריה', 'category', 'משפחה', 'חברים'] },
        // חיפוש עמודת "כמות מוזמנים"
        { label: 'כמות', keys: ['כמות', 'quantity', 'מוזמנים', 'guests', 'מספר מוזמנים'] },
    ];

    const smartDetails = [];

    for (const field of fieldMap) {
        const lowerCaseKeys = field.keys.map(k => k.toLowerCase().trim());
        
        for (const [key, value] of Object.entries(details || {})) {
            const normalizedKey = key.toLowerCase().trim();
            const normalizedValue = value ? value.toString().trim() : '';

            if (lowerCaseKeys.includes(normalizedKey) && normalizedValue && normalizedValue !== 'nan') {
                smartDetails.push({ label: field.label, value: normalizedValue });
                break;
            }
        }
    }
    return smartDetails;
};


// ============================================================
// Guest Card Component (עיצוב מינימלי ופרטים חכמים)
// ============================================================
export const GuestCard = ({ 
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
    setShowSuggestions,
    AUTO_SELECT_TH // צריך לקבל את ה-threshold (93)
}) => {
    const selectedContact = selectedContacts[currentGuest.guest];
    
    // 🔥 NEW: Extract smart details for display
    const smartDetails = getSmartDetails(currentGuest.guest_details || {});

    // פונקציית בחירת "לא נמצא"
    const selectNotFound = () => {
        const notFoundContact = {
            name: '❌ לא נמצא איש קשר מתאים',
            phone: '',
            score: 0,
            reason: 'לא נמצא',
            isNotFound: true
        };
        selectCandidate(notFoundContact);
    };
    
    // רכיב לרינדור מועמד
    const CandidateOption = ({ candidate, isSelected, onSelect }) => {
        const isAutoSelected = candidate.score >= AUTO_SELECT_TH;

        return (
            <div 
                className={`candidate-option ${isSelected ? 'selected' : ''} ${isAutoSelected && isSelected ? 'auto-selected' : ''}`}
                onClick={onSelect}
            >
                <div className="radio-label">
                    <div className="contact-name">
                        {candidate.name}
                        {candidate.score === 100 && (
                            <span className="perfect-match-indicator">
                                🎯
                            </span>
                        )}
                        {isAutoSelected && !isSelected && (
                            <span style={{ fontSize: '0.8rem', color: '#28aa9a', marginRight: '5px' }}>
                                (התאמה אוטומטית)
                            </span>
                        )}
                    </div>
                    <div className="contact-phone">📞 {candidate.phone}</div>
                </div>
                <input 
                    type="radio" 
                    name="contactMatch" 
                    className="radio-input"
                    checked={isSelected}
                    onChange={onSelect}
                />
            </div>
        );
    };
    
    // רכיב להצגת אפשרויות משניות קטנות יותר
    const SmallOption = ({ label, subLabel, isSelected, onSelect, className = '' }) => (
        <div 
            className={`candidate-option small ${className} ${isSelected ? 'selected' : ''}`}
            onClick={onSelect}
        >
            <div className="radio-label">
                <div className="contact-name">{label}</div>
                <div className="contact-phone">{subLabel}</div>
            </div>
            <input 
                type="radio" 
                name="contactMatch" 
                className="radio-input"
                checked={isSelected}
                onChange={onSelect}
            />
        </div>
    );

    const isSelected = !!selectedContact;

    return (
        <div className="guest-card-container">
            <div className="guest-progress">
                {currentGuestIndex + 1} / {totalGuests}
            </div>
            
            <h2 className="guest-name">{currentGuest.guest}</h2>
            
            {/* 🔥 NEW: Smart Details Display */}
            {smartDetails.length > 0 && (
                <div className="guest-details-smart">
                    {smartDetails.map((item, index) => (
                        <div key={index} className="smart-detail-item">
                            {item.label}: <strong>{item.value}</strong>
                        </div>
                    ))}
                </div>
            )}
            
            <h3>בחר איש קשר מתאים:</h3>
            
            {/* Display current selection status */}
            <div className="selection-status-box">
                {selectedContact ? (
                    selectedContact.isNotFound ? (
                        <span className="status-selected-none">
                            🚫 נבחר: השאר ללא מספר
                        </span>
                    ) : (
                        <span className="status-selected">
                            ✅ נבחר: <strong>{selectedContact.name}</strong> ({selectedContact.phone})
                        </span>
                    )
                ) : (
                    <span className="status-none">
                        ⚠️ אנא בחר איש קשר מתאים
                    </span>
                )}
            </div>

            <div className="candidates-list">
                {/* Candidates (Regular Options) */}
                {(currentGuest.candidates || []).map((candidate, index) => (
                    <CandidateOption
                        key={index}
                        candidate={candidate}
                        isSelected={selectedContact && selectedContact.phone === candidate.phone}
                        onSelect={() => selectCandidate(candidate)}
                    />
                ))}
            </div>
            
            {/* 🔥 NEW: Small Option - לא נמצא */}
            <SmallOption
                label="❌ לא נמצא איש קשר מתאים"
                subLabel="יישאר ללא מספר טלפון"
                isSelected={selectedContact?.isNotFound || false}
                onSelect={selectNotFound}
            />
            
            {/* 🔥 NEW: Manual Search Toggle */}
            <div 
                className="manual-search-toggle" 
                onClick={() => setShowAddContact(prev => !prev)}
            >
                {showAddContact ? '⬇️ סגור אפשרויות מתקדמות' : '➕ חפש או הוסף ידנית'}
            </div>
            
            {showAddContact && (
                <div className="manual-search-container">
                    
                    {/* חיפוש חכם */}
                    <label>חיפוש איש קשר (שם או טלפון)</label>
                    <input 
                        type="text" 
                        placeholder="הקלד שם או מספר"
                        value={searchInContacts}
                        onChange={(e) => {
                            setSearchInContacts(e.target.value);
                            handleSearchInput(e.target.value);
                            setShowSuggestions(true);
                        }}
                    />

                    {showSuggestions && searchSuggestions.length > 0 && (
                        <ul className="search-results-list">
                            {searchSuggestions.slice(0, 5).map((contact, index) => (
                                <li key={index} onClick={() => selectFromSuggestion(contact)}>
                                    {contact.name} 📞 {contact.phone}
                                </li>
                            ))}
                            {searchSuggestions.length > 5 && (
                                <li style={{ color: '#666', fontSize: '0.9rem' }}>
                                    ועוד {searchSuggestions.length - 5} תוצאות...
                                </li>
                            )}
                        </ul>
                    )}

                    <h4 style={{textAlign: 'center', margin: '20px 0'}}>או</h4>
                    
                    {/* הוספה ידנית */}
                    <label>הוספת מספר ידנית</label>
                    <input 
                        type="tel" 
                        placeholder="הזן מספר טלפון (05X-XXXXXXX)"
                        value={manualPhone}
                        onChange={(e) => setManualPhone(e.target.value)}
                    />
                    
                    <button 
                        className="btn btn-secondary" 
                        onClick={addManualContact}
                        disabled={!manualPhone || manualPhone.length < 9}
                        style={{ width: '100%', marginTop: '10px' }}
                    >
                        ➕ אשר והוסף מספר זה
                    </button>
                </div>
            )}
        </div>
    );
};

// ============================================================
// Success Screen Component
// ============================================================
export const SuccessScreen = ({ 
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