import React, { useState } from 'react';

// ============================================================
// Display Limit Component 
// ============================================================
const LimitDisplay = ({ currentUser, DAILY_LIMIT, onUpgradeClick }) => {
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
// Sidebar Component
// ============================================================
// ההטמעה של ה-Sidebar היא עדיין סטאטית מכיוון שאין לי גישה ל-getUniqueValues ו-currentGuestIndex
// כשהקובץ הזה מוטמע ב-ChatunoTech.jsx הוא אמור לעבוד כרגיל
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
// 🔥 CORE LOGIC: Helper to extract Smart Details (פתרון לשמות עמודות משתנים)
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
        // перебираем все возможные ключи в нижнем регистре
        const lowerCaseKeys = field.keys.map(k => k.toLowerCase().trim());
        
        for (const [key, value] of Object.entries(details || {})) {
            const normalizedKey = key.toLowerCase().trim();
            const normalizedValue = value ? value.toString().trim() : '';

            // בדיקה אם המפתח המנורמל קיים ברשימת המפתחות של השדה
            if (lowerCaseKeys.includes(normalizedKey) && normalizedValue && normalizedValue !== 'nan') {
                smartDetails.push({ label: field.label, value: normalizedValue });
                break; // נמצא ערך, עוברים לשדה החכם הבא
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
    
    // 🔥 שימוש בלוגיקה החכמה
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
            // 🔥 שימוש ב-isAutoSelected כדי לשמור על הבולטות הירוקה
            <div 
                className={`candidate-option ${isSelected ? 'selected' : ''}`}
                onClick={onSelect}
                style={isAutoSelected ? { borderColor: '#28a745' } : {}} // אופציונלי: עוד הדגשה
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
            
            <div className="candidates-list">
                {/* Candidates */}
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

            {/* כפתורי ניווט */}
            <div className="navigation-buttons">
                {currentGuestIndex > 0 && (
                    <button className="btn btn-secondary" onClick={() => {/* handlePreviousGuest */}}>
                        ⬅️ המוזמן הקודם
                    </button>
                )}
                <button 
                    className="btn btn-primary" 
                    onClick={() => {/* handleNextGuest */}}
                    disabled={!isSelected}
                >
                    {currentGuestIndex === totalGuests - 1 ? '🎉 סיים' : '➡️ המוזמן הבא'}
                </button>
            </div>
        </div>
    );
};

// ============================================================
// Main Matching Screen (The host component)
// ============================================================
export const MatchingScreen = ({ 
    matchingResults, currentGuestIndex, selectedContacts, selectCandidate, nextGuest, prevGuest,
    totalGuests, isLoading, showMessage, mobileContacts, onUpgradeClick, exportResults, currentUser,
    filters, setFilters, getUniqueValues, AUTO_SELECT_TH
}) => {
    // Local state for Manual/Search
    const [showAddContact, setShowAddContact] = useState(false);
    const [manualPhone, setManualPhone] = useState('');
    const [searchInContacts, setSearchInContacts] = useState('');
    const [searchSuggestions, setSearchSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);

    // Apply filters logic (assuming this is done in the main ChatunoTech.jsx)
    const filteredResults = matchingResults.filter(guest => {
        const details = getSmartDetails(guest.guest_details);
        let match = true;
        
        if (filters.צד && details.find(d => d.label === 'צד')?.value !== filters.צד) {
            match = false;
        }
        if (filters.קבוצה && details.find(d => d.label === 'קבוצה')?.value !== filters.קבוצה) {
            match = false;
        }
        
        return match;
    });

    const currentGuest = filteredResults[currentGuestIndex];
    if (!currentGuest) return null; // Should not happen in normal flow

    // Handler to search in all mobile contacts
    const handleSearchInput = (term) => {
        if (!term.trim()) {
            setSearchSuggestions([]);
            return;
        }
        const normalizedTerm = term.toLowerCase().trim();
        const results = mobileContacts.filter(contact => 
            contact.name.toLowerCase().includes(normalizedTerm) || 
            contact.phone.includes(normalizedTerm)
        ).map(contact => ({
            name: contact.name,
            phone: contact.phone,
            score: 50, // Score is arbitrary for search results
            reason: 'חיפוש ידני'
        }));
        setSearchSuggestions(results);
    };

    // Handler to select from search suggestions
    const selectFromSuggestion = (contact) => {
        selectCandidate(contact);
        setSearchInContacts('');
        setSearchSuggestions([]);
        setShowSuggestions(false);
    };

    // Handler to add a manual contact
    const addManualContact = () => {
        if (manualPhone.length < 9) {
            showMessage('מספר הטלפון אינו תקין', 'error');
            return;
        }
        const newContact = {
            name: `(הוספה ידנית) ${currentGuest.guest}`,
            phone: manualPhone,
            score: 100,
            reason: 'הוספה ידנית',
            isManual: true
        };
        selectCandidate(newContact);
        setManualPhone('');
        setShowAddContact(false);
        showMessage(`✅ המספר ${manualPhone} נבחר ל-${currentGuest.guest}`, 'success');
    };

    // Handler for previous guest
    const handlePreviousGuest = () => {
        prevGuest();
        setShowAddContact(false);
        setManualPhone('');
        setSearchInContacts('');
        setSearchSuggestions([]);
    };

    // Handler for next guest
    const handleNextGuest = () => {
        nextGuest();
        setShowAddContact(false);
        setManualPhone('');
        setSearchInContacts('');
        setSearchSuggestions([]);
    };
    
    // Total guests logic needs to be based on matchingResults.length if filtering is on the client side
    const totalFilteredGuests = filteredResults.length;

    return (
        <div className="matching-layout">
            
            <MatchingSidebar 
                currentUser={currentUser}
                DAILY_LIMIT={currentUser.DAILY_LIMIT} // Assuming it's available here
                exportResults={exportResults}
                isLoading={isLoading}
                currentGuestIndex={currentGuestIndex}
                filters={filters}
                setFilters={setFilters}
                getUniqueValues={getUniqueValues}
                onUpgradeClick={onUpgradeClick}
            />

            <div className="main-content">
                <GuestCard 
                    currentGuest={currentGuest}
                    currentGuestIndex={currentGuestIndex}
                    totalGuests={totalFilteredGuests}
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
                    AUTO_SELECT_TH={AUTO_SELECT_TH}
                />
                
                {/* Navigation Buttons are now inside GuestCard as per final UX/UI */}
            </div>

        </div>
    );
};


// רכיבי עזר נוספים
export const UploadScreen = () => <div>Upload Screen Content</div>;
export const SuccessScreen = () => <div>Success Screen Content</div>;