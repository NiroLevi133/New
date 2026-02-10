import React from 'react';

// ============================================================
// 1. UploadScreen - two-column card layout
// ============================================================
const UploadScreen = ({
  currentUser,
  uploadedFiles,
  handleFileUpload,
  supportsMobileContacts,
  requestMobileContacts,
  isLoading,
  startMerge,
  setShowContactsGuide,
  API_BASE_URL,
}) => {

  const isContactsFile = uploadedFiles.contacts !== null && uploadedFiles.contacts !== 'mobile_contacts';
  const isMobileContacts = uploadedFiles.contacts === 'mobile_contacts';

  return (
    <div className="upload-screen">
      <h2 className="screen-heading">
        שלום {currentUser.fullName}!
      </h2>
      <p className="screen-subtitle">
        העלה את שני הקבצים כדי להתחיל בהתאמה
      </p>

      <div className="upload-cards-row">
        {/* Guest List Card */}
        <div className={`upload-card ${uploadedFiles.guests ? 'upload-card--done' : ''}`}>
          <div className="upload-card-icon">&#x1F3A9;</div>
          <h3 className="upload-card-title">רשימת מוזמנים</h3>
          <p className="upload-card-subtitle">גיליון האקסל של המוזמנים שלך</p>
          <p className="upload-card-formats">.xlsx, .xls, או .csv</p>

          <label className="file-drop-zone">
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => handleFileUpload(e, 'guests')}
              disabled={isLoading}
            />
            <span className="file-drop-text">
              {uploadedFiles.guests ? uploadedFiles.guests.name : 'בחר קובץ'}
            </span>
          </label>

          {uploadedFiles.guests && (
            <div className="upload-card-success">נטען בהצלחה</div>
          )}
        </div>

        {/* Contacts Card */}
        <div className={`upload-card ${(isContactsFile || isMobileContacts) ? 'upload-card--done' : ''}`}>
          <div className="upload-card-icon">&#x1F4CB;</div>
          <h3 className="upload-card-title">אנשי קשר מ-WhatsApp</h3>
          <p className="upload-card-subtitle">יוצא דרך תוסף JONI</p>
          <p className="upload-card-formats">.xlsx, .xls, או .csv</p>

          {supportsMobileContacts && (
            <button
              className="btn btn-secondary btn-small"
              onClick={requestMobileContacts}
              disabled={isLoading || isContactsFile || isMobileContacts}
              style={{ width: '100%', marginBottom: '8px' }}
            >
              {isMobileContacts ? 'נטענו אנשי קשר מהטלפון' : 'גישה לאנשי קשר בטלפון'}
            </button>
          )}

          {supportsMobileContacts && !isMobileContacts && (
            <div className="upload-card-divider">או</div>
          )}

          {!isMobileContacts && (
            <label className="file-drop-zone">
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => handleFileUpload(e, 'contacts')}
                disabled={isLoading || isMobileContacts}
              />
              <span className="file-drop-text">
                {isContactsFile ? uploadedFiles.contacts.name : 'בחר קובץ'}
              </span>
            </label>
          )}

          {(isContactsFile || isMobileContacts) && (
            <div className="upload-card-success">
              {isMobileContacts ? 'אנשי קשר מהטלפון נטענו' : 'נטען בהצלחה'}
            </div>
          )}

          <button
            className="btn-link"
            onClick={() => setShowContactsGuide(true)}
            type="button"
          >
            איך להוציא אנשי קשר?
          </button>
        </div>
      </div>

      <button
        className="btn btn-primary btn-cta"
        onClick={startMerge}
        disabled={!uploadedFiles.guests || !uploadedFiles.contacts || isLoading}
      >
        <span>&#x2764;</span>
        {isLoading ? 'טוען...' : 'מצא התאמות'}
      </button>

      <div className="upload-templates">
        <p className="upload-templates-label">צריך עזרה? הורד קבצי דוגמה:</p>
        <div className="upload-templates-buttons">
          <button
            className="btn btn-secondary btn-small"
            onClick={() => window.open(`${API_BASE_URL}/download-guests-template`, '_blank')}
          >
            דוגמה - מוזמנים
          </button>
          <button
            className="btn btn-secondary btn-small"
            onClick={() => window.open(`${API_BASE_URL}/download-contacts-template`, '_blank')}
          >
            דוגמה - אנשי קשר
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// 2. GuestCard
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
}) => {
  const guestDetails = currentGuest.guest_details || {};
  const selectedCandidate = selectedContacts[currentGuest.guest];
  const sortedCandidates = (currentGuest.candidates || []).sort((a, b) => b.score - a.score);

  return (
    <>
      <div className="guest-card-container">
        <div className="guest-header">
          <div className="guest-progress">
            {currentGuestIndex + 1} / {totalGuests}
          </div>
        </div>

        <div className="guest-name">
          {currentGuest.best_score === 100 && '\u{1F451} '}
          {currentGuest.guest}
        </div>

        {Object.keys(guestDetails).length > 0 && (
          <div className="guest-details-container">
            {Object.entries(guestDetails).map(([key, value]) => (
              <div key={key} className="guest-detail-item">
                <strong>{key}:</strong> {value}
              </div>
            ))}
          </div>
        )}

        <h3 style={{ textAlign: 'center', marginBottom: '15px', fontFamily: 'var(--font-heading)' }}>
          {currentGuest.best_score >= 93 && currentGuest.best_score < 100
            ? 'המלצת המערכת (93%+)'
            : 'בחר איש קשר מתאים:'}
        </h3>

        <div className="candidates-list">
          {sortedCandidates.map((candidate, idx) => {
            const isThisSelected = selectedCandidate?.phone === candidate.phone;
            const isAutoSelected = candidate.score >= 93 && currentGuest.best_score < 100;

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
                  <div className="contact-phone">{candidate.phone}</div>
                  {candidate.reason && (
                    <div className="contact-phone" style={{ fontSize: '0.8rem' }}>
                      {candidate.reason}
                    </div>
                  )}
                </div>
                <div style={{
                  fontSize: '1.2rem', fontWeight: 'bold',
                  color: isAutoSelected ? 'var(--color-warning)' : 'var(--color-text-light)'
                }}>
                  {candidate.score}%
                </div>
              </div>
            );
          })}
        </div>

        {/* Not found option */}
        <div
          className={`candidate-option ${selectedCandidate?.isNotFound ? 'selected' : ''}`}
          onClick={() => selectCandidate({ isNotFound: true, name: 'לא נמצא', phone: '', score: 0 })}
          style={{
            marginTop: '15px',
            background: selectedCandidate?.isNotFound ? 'rgba(217, 79, 87, 0.06)' : undefined,
            borderColor: selectedCandidate?.isNotFound ? 'var(--color-error)' : undefined,
          }}
        >
          <div className="candidate-info">
            <div className="contact-name">המוזמן לא נמצא באנשי הקשר שלי</div>
            <div className="contact-phone">סמן אם ברצונך להשאיר את המספר ריק</div>
          </div>
        </div>
      </div>

      {/* Manual search/add */}
      <div className="manual-search-box">
        <h3>או חפש / הוסף מספר באופן ידני:</h3>

        <div style={{ position: 'relative' }}>
          <input
            type="text"
            placeholder="חפש שם או הזן מספר טלפון..."
            value={searchInContacts}
            onChange={(e) => {
              handleSearchInput(e.target.value);
              setManualPhone(e.target.value.replace(/[^\d]/g, ''));
            }}
          />

          {showSuggestions && searchSuggestions.length > 0 && (
            <div className="search-suggestions">
              {searchSuggestions.map((contact, idx) => (
                <div
                  key={idx}
                  onClick={() => selectFromSuggestion(contact)}
                  className="search-suggestion-item"
                >
                  <div style={{ fontWeight: '600' }}>{contact.name}</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>{contact.phone}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {manualPhone && manualPhone.length >= 9 && !showSuggestions && (
          <button
            className="btn btn-secondary btn-small"
            onClick={addManualContact}
            style={{ width: '100%', marginTop: '10px' }}
          >
            הוסף מספר ידני: {manualPhone}
          </button>
        )}
      </div>
    </>
  );
};

// ============================================================
// 3. SuccessScreen
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
    <div className="success-screen">
      <div className="success-icon">&#x2728;</div>
      <h2 className="screen-heading">משימת האימות הושלמה!</h2>
      <p className="screen-subtitle">עיבדת בהצלחה {currentGuestIndex + 1} מוזמנים!</p>

      {(perfectMatchesCount > 0 || autoSelectedCount > 0) && (
        <div className="success-stats">
          {perfectMatchesCount > 0 && (
            <div className="success-stat-item">
              <span className="success-stat-number">{perfectMatchesCount}</span>
              <span className="success-stat-label">התאמות מושלמות</span>
            </div>
          )}
          {autoSelectedCount > 0 && (
            <div className="success-stat-item">
              <span className="success-stat-number">{autoSelectedCount}</span>
              <span className="success-stat-label">התאמות אוטומטיות</span>
            </div>
          )}
        </div>
      )}

      <div className="success-download-box">
        <h3>מה עכשיו?</h3>
        <p>הורד את קובץ התוצאות המעודכן, הכולל את כל המספרים שאומתו.</p>
      </div>

      <button
        className="btn btn-primary btn-cta"
        onClick={exportResults}
        disabled={isLoading}
      >
        {isLoading ? 'מכין קובץ...' : 'הורד את התוצאות'}
      </button>

      <div style={{ marginTop: '16px' }}>
        <button className="btn btn-ghost" onClick={onRestart}>
          התחל מחדש
        </button>
      </div>
    </div>
  );
};

// ============================================================
// 4. MatchingSidebar - removed (kept for compatibility)
// ============================================================
const MatchingSidebar = () => null;

export {
  UploadScreen,
  MatchingSidebar,
  GuestCard,
  SuccessScreen
};
