/**
 * 86° PUNCHCARD — Application Logic
 * Vanilla JS with Supabase Realtime & Security Hardening
 */

// ==========================================
// CONFIGURATION & CONSTANTS
// ==========================================
const MAX_STAMPS = 10;
const REGULARS_MIN_STAMPS = 30;
// Bumped alongside service-worker.js's CACHE_NAME on every deploy — lets
// a deployed build be confirmed (e.g. curl the live app.js and grep for
// this) independent of whatever a given browser/service-worker cache is
// actually serving a specific device.
const APP_BUILD_ID = 'v76';
const DB_NAME = '86_punchcard_db';
const DB_VERSION = 1;
const INTEGRITY_SALT = '86_DEGREES_MONOCHROME_SALT_2026';

// Supabase Cloud Configuration
const SUPABASE_URL = 'https://edunsrtcdhnpbsipalhc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_eBMuMX2di-IB74UsVk9rTQ_lcvNyPCv';

// Netaville app store links — the "student discount" promo banner stays
// hidden until these are filled in, so it can't ever point somewhere broken.
const NETAVILLE_ANDROID_URL = 'https://play.google.com/store/apps/details?id=com.netcetera.android.netaville.prod&hl=en&gl=US&pli=1';
const NETAVILLE_IOS_URL = 'https://apps.apple.com/us/app/netaville/id1643904350';

let supabaseClient = null;
let realtimeChannel = null;

// 16 Curated DiceBear Avatars (croodles-neutral) — the avatar picker
// stores one of these seed keys on the customer record; the actual
// artwork is fetched live from DiceBear's HTTP API, not baked in here.
const DICEBEAR_STYLE = 'croodles-neutral';
const AVATAR_SEEDS = ['Milo', 'Nova', 'Kai', 'Zara', 'Leo', 'Luna', 'Remy', 'Sage', 'Ivy', 'Finn', 'Coco', 'Ash', 'Rio', 'Wren', 'Blue', 'Juno'];
function avatarUrl(seed) {
  return `https://api.dicebear.com/10.x/${DICEBEAR_STYLE}/svg?seed=${encodeURIComponent(seed)}&backgroundColor=ffffff`;
}
const MONOCHROME_AVATARS = AVATAR_SEEDS.reduce((acc, seed) => {
  acc[seed] = `<img src="${avatarUrl(seed)}" alt="" loading="lazy">`;
  return acc;
}, {});
MONOCHROME_AVATARS.person = MONOCHROME_AVATARS[AVATAR_SEEDS[0]];

// ==========================================
// TRANSLATIONS (EN / MK / SQ)
// Covers app chrome — nav, buttons, labels, modal copy. Legal text
// (Terms/Privacy body), toast messages, menu items, and activity log
// entries stay in English (out of scope for a first pass).
// ==========================================
const TRANSLATIONS = {
  en: {
    posterBadge: "OFFICIAL LOYALTY CARD",
    posterHeadline: "GET FREE COFFEE ON US",
    posterSubheadline: "Scan the QR code with your phone camera to activate your Eightysix° Virtual Card. Collect stamps & unlock free drinks!",
    posterQrCaption: "POINT CAMERA TO SCAN",
    posterFeature1: "Stamp per Coffee",
    posterFeature2: "Double Dose = 2 Stamps",
    posterFeature3: "Stamps = Free Coffee",
    signupTitle: "Welcome",
    signupSubtitle: "Get your virtual card or find an existing one.",
    signupSubtitleNew: "Get your virtual card in seconds.",
    signupSubtitleFind: "Enter your username and password to log back into your card.",
    tabNewCard: "New Card",
    tabFindCard: "Find My Card",
    phDisplayName: "Display Name (e.g. Alex)",
    phUsername: "Username (Used to log in)",
    phPassword: "Password (8+ chars)",
    phPasswordConfirm: "Confirm Password",
    pwReqLength: "8+ characters",
    pwReqUpper: "Uppercase letter",
    pwReqLower: "Lowercase letter",
    pwReqNumber: "Number",
    errPasswordMismatch: "Passwords don't match",
    errChooseUsername: "Please choose a username",
    errChooseDisplayName: "Please enter a display name",
    errDisplayNameRateLimited: "You can change your name again on {date}",
    errDisplayNameTaken: "That name is already taken by another card — try adding an initial or number",
    errPasswordMinLength: "Password must be at least 6 characters",
    errPasswordWeak: "Password must be 8+ characters with an uppercase letter, a lowercase letter, and a number",
    errUsernameTaken: "That username is taken. Wrong password? Use \"Find My Card\" to log in.",
    errInvalidSignupInput: "Please enter a username and a stronger password",
    errServerConnection: "Could not reach the server. Check your connection and try again.",
    errSessionExpired: "Your session expired — please log in again.",
    errAcceptTos: "Please accept the Terms of Service & Privacy Policy",
    errSignupGeneric: "Something went wrong. Please try again.",
    errEnterUsernamePassword: "Please enter your username and password",
    errIncorrectLogin: "Incorrect username or password",
    toastWelcomeNew: "Welcome to Eightysix°!",
    toastWelcomeBack: "Welcome back, {name}!",
    toastLoggedOut: "Logged out of card",
    updateAvailable: "New version available — tap to refresh",
    btnCreateCard: "Create My Card",
    phEnterUsername: "Enter your Username",
    phPasswordPlain: "Password",
    btnLogin: "Log In to My Card",
    staffPortalTitle: "Staff Portal",
    staffPortalSubtitle: "Authorized Eightysix° Staff Only",
    installBannerTitle: "Add to Home Screen",
    installBannerSubtitle: "Instant access, works offline",
    installBannerBtn: "Install",
    walletTitle: "Rewards Wallet",
    walletCountSingular: "1 Free Coffee Available",
    walletCountPlural: "{n} Free Coffees Available",
    walletExpiredText: "Reward expired (1 year unredeemed)",
    walletExpiresToday: "Expires today",
    walletExpiresInDay: "Expires in 1 day",
    walletExpiresInDays: "Expires in {n} days",
    btnRedeem: "Redeem",
    btnShowQr: "Show My QR Code",
    addStampLabel: "ADD STAMP",
    btnRedeemBanked: "Redeem 1 Banked Reward",
    btnRedeemBankedPlural: "Redeem {n} Banked Rewards",
    voidNoRedemption: "No redemption to void for this customer",
    voidErrorConnection: "Could not void — check your connection",
    voidSuccess: "Redemption voided",
    btnMarkStudent: "Mark as Student",
    btnUnmarkStudent: "Student ✓ (Tap to Remove)",
    studentBadgeLabel: "Student",
    studentStatusOn: "Marked as a verified student",
    studentStatusOff: "Student status removed",
    cardBackTitle: "Your Stats",
    cardBackLifetimeStamps: "Lifetime Stamps",
    cardBackRedeemed: "Coffees Redeemed",
    cardBackRank: "Leaderboard Rank",
    cardBackMemberSince: "Member Since",
    studentStatusError: "Could not update — check your connection",
    settingsStudentDiscount: "Student Discount",
    studentPromoTitle: "Get the Student Discount",
    studentPromoSubtitle: "Sign up in Netaville with your student email, then ask staff to verify you",
    studentPromoBtn: "Netaville App",
    staffModeTitle: "Staff Mode Active",
    staffModeText: "Select a customer from the list to view and stamp their card.",
    navCard: "Card",
    navMenu: "Menu",
    navLeaderboard: "Ranks",
    navCustomers: "Customers",
    navEditMenu: "Edit Menu",
    navActivity: "Activity",
    navSettings: "Settings",
    btnAddItem: "+ Add Item",
    phSearchCustomers: "Search name or phone...",
    phSearchActivity: "Search customer ID or action...",
    filterAll: "All",
    filterRedemptions: "Redemptions",
    filterStamps: "Stamps",
    dashboardTitle: "Settings",
    statStampsToday: "Stamps Today",
    statRewardsGiven: "Rewards Given",
    statActiveCards: "Active Cards",
    settingsStoreInsights: "Store Insights",
    statStampsWeek: "Stamps This Week",
    statStampsMonth: "Stamps This Month",
    statRedemptionsMonth: "Redeemed This Month",
    statTopDrinksLabel: "Top Drinks — Last 30 Days",
    settingsMyProfile: "My Profile",
    statYourStampsToday: "Stamps Today",
    statYourRewardsToday: "Rewards Today",
    statYourStampsTotal: "Lifetime Stamps",
    settingsLanguage: "Language",
    settingsAccount: "Account",
    settingsChooseAvatar: "Choose Avatar",
    settingsLogOut: "Log Out",
    settingsAppLegal: "App & Legal",
    settingsTos: "Terms of Service",
    settingsPrivacy: "Privacy Policy",
    tosSubtitle: "Eightysix° Loyalty Program Terms",
    tosPara1: "<strong>1. Program Overview:</strong> The Eightysix° Loyalty Program allows customers to earn 1 stamp per standard beverage purchase (or 2 stamps for double-dose items like Freddo Espresso).",
    tosPara2: "<strong>2. Reward Redemption:</strong> Collecting 10 stamps unlocks 1 Free Coffee Reward. Rewards can be redeemed at participating Eightysix° locations or saved to your digital Rewards Wallet.",
    tosPara3: "<strong>3. Account Security:</strong> You are responsible for maintaining the confidentiality of your account credentials. Passwords must meet our minimum strength requirements (8+ characters, including an uppercase letter, a lowercase letter, and a number).",
    tosPara4: "<strong>4. Google Sign-In:</strong> If you choose to continue with Google, your account is created and matched using your Google name and email address. Your use of Google Sign-In is also subject to Google's own Terms of Service.",
    privacySubtitle: "How Eightysix° protects your data",
    privacyPara1: "<strong>1. Data Collection:</strong> We collect only essential information (username/display name and, depending on how you sign up, an optional phone number, password, or Google account name and email) required to identify your account and sync your loyalty stamps across your devices.",
    privacyPara2: "<strong>2. Storage & Security:</strong> Data is encrypted locally and synced securely to Supabase Cloud infrastructure with anti-tampering checksums. Passwords are never stored in plain text — only a one-way cryptographic hash is kept, and it can't be reversed back into your password.",
    privacyPara3: "<strong>3. No Third-Party Sharing:</strong> Your personal information is strictly used for Eightysix° loyalty services and will never be sold or shared.",
    privacyPara4: "<strong>4. Signing In With Google:</strong> If you use \"Continue with Google\", we receive only your name and email address from Google to create and identify your card — never your Google password, and we never access any other part of your Google account.",
    btnPrivacyAgree: "I Understand",
    confirmRedeemTitle: "Redeem Reward?",
    confirmRedeemSubtitle: "This uses 1 free coffee from the wallet and can't be undone.",
    btnConfirmRedeem: "Redeem",
    btnCancel: "Cancel",
    btnDeleteAll: "Delete All Data",
    showQrTitle: "Your QR Code",
    showQrSubtitle: "Show this to the barista to get your stamps.",
    btnClose: "Close",
    drinkPickerTitle: "Select Drink",
    drinkPickerSubtitle: "Double-dose drinks like Freddo Espresso earn 2 stamps!",
    drinkStandardName: "Standard Coffee / Tea",
    drinkStandardDesc: "Espresso, Latte, Americano",
    stamp1: "+1 Stamp",
    drinkMatchaName: "Matcha",
    drinkMatchaDesc: "Hot or Iced Ceremonial Matcha",
    stamp2: "+2 Stamps",
    drinkFreddoName: "Freddo Espresso",
    drinkFreddoDesc: "Signature Double Cold Espresso",
    drinkSpecialtyName: "Specialty Combo",
    drinkSpecialtyDesc: "Multiple items or large order",
    stamp3: "+3 Stamps",
    editCustomerTitle: "Edit Customer",
    labelDisplayName: "Display Name",
    labelPhoneUsername: "Phone / Username",
    labelResetPassword: "Reset Password (leave blank to skip)",
    btnDeleteCard: "Delete Card",
    btnSaveChanges: "Save Changes",
    btnIAgree: "I Agree",
    btnGotIt: "Got It",
    avatarModalTitle: "Choose Avatar",
    avatarModalSubtitle: "Pick an icon for your card",
    installGuideSubtitle: "Install Eightysix° for instant full-screen access and offline support.",
    installStep1Title: "Tap the Share Icon",
    installStep1Desc: "Tap the <strong>Share</strong> button at the bottom of your browser screen",
    installStep2Title: 'Select "Add to Home Screen"',
    installStep2Desc: "Scroll down the menu options and tap <strong>Add to Home Screen</strong>",
    installStep3Title: 'Tap "Add"',
    installStep3Desc: "Confirm by tapping <strong>Add</strong> in the top right corner",
    scanQrTitle: "Scan Customer QR",
    scanQrSubtitle: "Point camera at customer's QR code.",
    btnCancelScan: "Cancel Scan",
    rewardTitle: "FREE COFFEE UNLOCKED",
    rewardSubtitle: "You collected 10 stamps! Show your barista to redeem or save it to your wallet for later.",
    btnRedeemNow: "Redeem Now at Counter",
    btnKeepWallet: "Keep in Wallet & Reset Card",
    milestoneTitle: "{tier} TIER REACHED",
    milestoneSubtitle: "You just hit {tier} status — enjoy {n} bonus stamps!",
    btnAwesome: "Awesome!",
    staffAccessTitle: "Staff Access",
    staffAccessSubtitle: "Enter PIN to access staff features.",
    labelName: "Name",
    labelCategory: "Category",
    labelSubtext: "Subtext (Optional)",
    labelPrice: "Price",
    labelBonusStamps: "Bonus Stamps",
    labelStudentPrice: "Student Price (Optional)",
    menuItemDiscountPreview: "That's {n}% off the regular price",
    menuViewRegular: "Regular",
    menuViewStudent: "Student",
    menuNewSectionOption: "+ Add New Section…",
    phNewSectionName: "New section name",
    menuSectionEmpty: "empty",
    menuSectionDeleted: "Section deleted",
    errSectionNameRequired: "Enter a name for the new section",
    btnDelete: "Delete",
    btnSave: "Save",
    settingsChangeDisplayName: "Display Name",
    btnSkipForNow: "Later",
    notifPanelTitle: "Notifications",
    notifPanelEmpty: "You're all caught up — no notifications yet.",
    btnClearAll: "Clear All",
    timeJustNow: "Just now",
    timeMinutesAgo: "{n}m ago",
    timeHoursAgo: "{n}h ago",
    timeDaysAgo: "{n}d ago",
    settingsFriends: "Friends",
    settingsFriendsSub: "Gift a free coffee to someone",
    friendsModalTitle: "Friends",
    friendsModalSubtitle: "Send a friend request by their display name. Once they accept, you can gift each other a free coffee.",
    phFriendName: "Friend's display name",
    errEnterFriendName: "Please enter a name",
    btnAddFriend: "Add",
    friendRequestsLabel: "Friend Requests",
    friendsListLabel: "Your Friends",
    friendsEmpty: "No friends yet — send a request above.",
    errFriendNotFound: "No account found with that name",
    errCannotAddSelf: "You can't add yourself",
    toastFriendAdded: "Added {name} as a friend!",
    toastFriendRequestSent: "Friend request sent to {name}",
    toastFriendRequestAccepted: "You and {name} are now friends!",
    errAlreadyFriends: "You're already friends with {name}",
    errAlreadyPending: "You already sent {name} a friend request",
    errNotFriends: "You're not friends with this person anymore",
    btnAcceptRequest: "Accept",
    btnDeclineRequest: "Decline",
    btnGiftReward: "Gift a free coffee",
    errNoRewardToGift: "You don't have a free coffee to gift right now",
    confirmGiftTitle: "Gift This Reward?",
    confirmGiftText: "Send your free coffee to {name}? This can't be undone.",
    btnConfirmGift: "Send Gift",
    toastGiftSent: "Gift sent! 🎁",
    confirmRemoveFriendTitle: "Remove Friend?",
    confirmRemoveFriendText: "Remove {name}? You'll need to send a new request to add them again.",
    btnConfirmRemoveFriend: "Remove",
    loadingText: "Loading…",
    setDisplayNameTitle: "Display Name",
    setDisplayNameSubtitle: "The name shown on your card, and how friends find and add you. Changeable once every 14 days.",
    toastDisplayNameSaved: "Display name saved!",
    homeGreetingGuest: "Hi, Guest",
    hiName: "Hi, {name}",
    homeSubtitleGuest: "Please sign in or ask staff to create a card.",
    homeSubtitleRewardReady: "★ Reward Ready for Redemption",
    progressMsgRewardReady: "Reward earned! Show barista to redeem.",
    homeSubtitleDigital: "Digital Punchcard",
    progressMsgStampsNeeded: "{n} to go!",
    menuModalEditItem: "Edit Item",
    menuModalAddItem: "Add New Item",
    loggedInAs: "Logged in as {name}",
    phStaffEmail: "Staff Email",
    btnStaffLogin: "Log In",
    authDividerOr: "or",
    btnCustomerGoogleLogin: "Continue with Google",
    btnVoidRedemption: "Void Last Redemption",
    sortRecent: "Recent",
    sortRegulars: "Regulars",
    settingsCampaign: "Stamp Campaign",
    campaignDoubleStamps: "Double Stamps",
    campaignInactive: "Inactive",
    badge_bronze: "Bronze",
    badge_silver: "Silver",
    badge_gold: "Gold",
    badge_platinum: "Platinum",
    menuBonusNoteTitle: "Double Dose Bonus",
    menuBonusNoteBody: "Double-dose drinks like Freddo Espresso earn <strong>2 stamps</strong> instead of 1. Every 10 stamps unlocks 1 free coffee.",
    catEspressoBased: "Espresso Based",
    catInstantCoffee: "Instant Coffee",
    catMatchaSpecialty: "Matcha & Specialty",
    catSoftDrinks: "Soft Drinks",
    catWarmComfort: "Warm Comfort",
    leaderboardTitle: "Leaderboard",
    leaderboardSubtitle: "Ranked by lifetime stamps earned",
    leaderboardSubtitleMonthly: "Ranked by stamps earned this month",
    leaderboardEmpty: "No one's on the board yet — be the first!",
    leaderboardYourRank: "Your Rank",
    leaderboardNotRanked: "Earn your first stamp to join the leaderboard!",
    lifetimeStampsShort: "stamps",
    lbPeriodAllTime: "All Time",
    lbPeriodMonthly: "This Month",
    settingsLeaderboard: "Leaderboard",
    campaignBannerTitle: "Double Stamps Today!",
    campaignBannerSubtitle: "Every order earns 2x stamps right now"
  },
  mk: {
    posterBadge: "ОФИЦИЈАЛНА КАРТИЧКА ЗА ЛОЈАЛНОСТ",
    posterHeadline: "ДОБИЈТЕ БЕСПЛАТНО КАФЕ",
    posterSubheadline: "Скенирајте го QR кодот со камерата на телефонот за да ја активирате вашата Eightysix° виртуелна картичка. Собирајте печати и отклучете бесплатни пијалаци!",
    posterQrCaption: "НАСОЧЕТЕ ЈА КАМЕРАТА ЗА СКЕНИРАЊЕ",
    posterFeature1: "печат по кафе",
    posterFeature2: "Двојна доза = 2 печати",
    posterFeature3: "печати = бесплатно кафе",
    signupTitle: "Добредојде",
    signupSubtitle: "Направете виртуелна картичка или пронајдете постоечка.",
    signupSubtitleNew: "Направете ја вашата виртуелна картичка за неколку секунди.",
    signupSubtitleFind: "Внесете корисничко име и лозинка за да се вратите на вашата картичка.",
    tabNewCard: "Нова картичка",
    tabFindCard: "Пронајди картичка",
    phDisplayName: "Име за прикажување (пр. Алекс)",
    phUsername: "Корисничко име (за најава)",
    phPassword: "Лозинка (8+ карактери)",
    phPasswordConfirm: "Потврди лозинка",
    pwReqLength: "8+ карактери",
    pwReqUpper: "Голема буква",
    pwReqLower: "Мала буква",
    pwReqNumber: "Број",
    errPasswordMismatch: "Лозинките не се совпаѓаат",
    errChooseUsername: "Ве молиме изберете корисничко име",
    errChooseDisplayName: "Ве молиме внесете име за прикажување",
    errDisplayNameRateLimited: "Можете повторно да го смените вашето име на {date}",
    errDisplayNameTaken: "Тоа име веќе го користи друга картичка — пробајте да додадете иницијал или број",
    errPasswordMinLength: "Лозинката мора да има најмалку 6 карактери",
    errPasswordWeak: "Лозинката мора да има 8+ карактери, голема буква, мала буква и број",
    errUsernameTaken: "Тоа корисничко име е зафатено. Погрешна лозинка? Користете „Најди ја мојата картичка“ за да се најавите.",
    errInvalidSignupInput: "Внесете корисничко име и посилна лозинка",
    errServerConnection: "Не може да се поврземе со серверот. Проверете ја вашата врска и обидете се повторно.",
    errSessionExpired: "Вашата сесија истече — најавете се повторно.",
    errAcceptTos: "Ве молиме прифатете ги Условите за користење и Политиката за приватност",
    errSignupGeneric: "Нешто тргна наопаку. Обидете се повторно.",
    errEnterUsernamePassword: "Внесете ги вашето корисничко име и лозинка",
    errIncorrectLogin: "Погрешно корисничко име или лозинка",
    toastWelcomeNew: "Добредојдовте во Eightysix°!",
    toastWelcomeBack: "Добредојдовте назад, {name}!",
    toastLoggedOut: "Одјавени сте од картичката",
    updateAvailable: "Достапна е нова верзија — допрете за освежување",
    btnCreateCard: "Направи ја мојата картичка",
    phEnterUsername: "Внесете го вашето корисничко име",
    phPasswordPlain: "Лозинка",
    btnLogin: "Најави се на мојата картичка",
    staffPortalTitle: "Портал за вработени",
    staffPortalSubtitle: "Само за овластен персонал на Eightysix°",
    installBannerTitle: "Додади на почетен екран",
    installBannerSubtitle: "Инстантен пристап, работи и офлајн",
    installBannerBtn: "Инсталирај",
    walletTitle: "Паричник со награди",
    walletCountSingular: "1 бесплатно кафе достапно",
    walletCountPlural: "{n} бесплатни кафиња достапни",
    walletExpiredText: "Наградата истече (1 година неискористена)",
    walletExpiresToday: "Истекува денес",
    walletExpiresInDay: "Истекува за 1 ден",
    walletExpiresInDays: "Истекува за {n} дена",
    btnRedeem: "Искористи",
    btnShowQr: "Прикажи го мојот QR код",
    addStampLabel: "ДОДАДИ ПЕЧАТ",
    btnRedeemBanked: "Искористи 1 зачувана награда",
    btnRedeemBankedPlural: "Искористи {n} зачувани награди",
    voidNoRedemption: "Нема искористување за поништување за овој клиент",
    voidErrorConnection: "Не можеше да се поништи — проверете ја вашата врска",
    voidSuccess: "Искористувањето е поништено",
    btnMarkStudent: "Означи како студент",
    btnUnmarkStudent: "Студент ✓ (Допри за отстранување)",
    studentBadgeLabel: "Студент",
    studentStatusOn: "Означен како потврден студент",
    studentStatusOff: "Статусот на студент е отстранет",
    studentStatusError: "Не можеше да се ажурира — проверете ја вашата врска",
    cardBackTitle: "Вашата статистика",
    cardBackLifetimeStamps: "Вкупно печати",
    cardBackRedeemed: "Искористени кафиња",
    cardBackRank: "Ранг на табела",
    cardBackMemberSince: "Член од",
    settingsStudentDiscount: "Студентски попуст",
    studentPromoTitle: "Добијте студентски попуст",
    studentPromoSubtitle: "регистрирајте се на Netaville апликацијата со вашиот студентски е-маил, потоа побарајте персоналот да ве потврди.",
    studentPromoBtn: "Netaville Апликација",
    staffModeTitle: "Режим за вработени активен",
    staffModeText: "Изберете клиент од листата за да ја видите и печатите картичката.",
    navCard: "Картичка",
    navMenu: "Мени",
    navLeaderboard: "Рангови",
    navCustomers: "Клиенти",
    navEditMenu: "Уреди мени",
    navActivity: "Активност",
    navSettings: "Поставки",
    btnAddItem: "+ Додади ставка",
    phSearchCustomers: "Пребарувај име или телефон...",
    phSearchActivity: "Пребарувај ID на клиент или дејство...",
    filterAll: "Сите",
    filterRedemptions: "Искористени",
    filterStamps: "Печати",
    dashboardTitle: "Поставки",
    statStampsToday: "Печати денес",
    statRewardsGiven: "Дадени награди",
    statActiveCards: "Активни картички",
    settingsStoreInsights: "Преглед на продавницата",
    statStampsWeek: "Печати оваа седмица",
    statStampsMonth: "Печати овој месец",
    statRedemptionsMonth: "Искористени овој месец",
    statTopDrinksLabel: "Најпопуларни пијалоци — последни 30 дена",
    settingsMyProfile: "Мојот профил",
    statYourStampsToday: "Печати денес",
    statYourRewardsToday: "Награди денес",
    statYourStampsTotal: "Вкупно печати",
    settingsLanguage: "Јазик",
    settingsAccount: "Профил",
    settingsChooseAvatar: "Избери аватар",
    settingsLogOut: "Одјави се",
    settingsAppLegal: "Апликација и правни информации",
    settingsTos: "Услови за користење",
    settingsPrivacy: "Политика за приватност",
    tosSubtitle: "Услови на програмата за лојалност на Eightysix°",
    tosPara1: "<strong>1. Преглед на програмата:</strong> Програмата за лојалност Eightysix° им овозможува на клиентите да освојат 1 печат по стандардна нарачка на пијалак (или 2 печати за пијалаци со двојна доза, како Фредо еспресо).",
    tosPara2: "<strong>2. Искористување награда:</strong> Со собирање 10 печати се отклучува 1 бесплатна награда за кафе. Наградите можат да се искористат во учесничките локации на Eightysix° или да се зачуваат во вашиот дигитален паричник за награди.",
    tosPara3: "<strong>3. Безбедност на профилот:</strong> Одговорни сте за чувањето на доверливоста на вашите податоци за најавување. Лозинките мора да ги исполнуваат нашите минимални барања (8+ карактери, вклучувајќи голема буква, мала буква и број).",
    tosPara4: "<strong>4. Најава со Google:</strong> Ако изберете да продолжите со Google, вашиот профил се создава и препознава користејќи го вашето име и е-пошта од Google. Употребата на најавата со Google подлежи и на условите за користење на Google.",
    privacySubtitle: "Како Eightysix° ги штити вашите податоци",
    privacyPara1: "<strong>1. Собирање податоци:</strong> Собираме само основни информации (корисничко име/име за прикажување и, во зависност од начинот на најава, опционален телефонски број, лозинка или име и е-пошта од Google профилот) потребни за препознавање на вашиот профил и синхронизирање на вашите печати на сите уреди.",
    privacyPara2: "<strong>2. Складирање и безбедност:</strong> Податоците се шифрирани локално и безбедно се синхронизираат со Supabase Cloud инфраструктурата, со контроли за спречување манипулација. Лозинките никогаш не се чуваат во обична текстуална форма — се чува само еднонасочен криптографски хеш, кој не може да се врати назад во вашата лозинка.",
    privacyPara3: "<strong>3. Без споделување со трети лица:</strong> Вашите лични податоци се користат исклучиво за услугите на лојалност на Eightysix° и никогаш нема да бидат продадени или споделени.",
    privacyPara4: "<strong>4. Најава со Google:</strong> Ако користите „Продолжи со Google“, добиваме само вашето име и е-пошта од Google за да го создадеме и препознаеме вашиот профил — никогаш вашата Google лозинка, и никогаш не пристапуваме до кој било друг дел од вашиот Google профил.",
    btnPrivacyAgree: "Разбирам",
    confirmRedeemTitle: "Да се искористи наградата?",
    confirmRedeemSubtitle: "Ова троши 1 бесплатно кафе од паричникот и не може да се врати.",
    btnConfirmRedeem: "Искористи",
    btnCancel: "Откажи",
    btnDeleteAll: "Избриши ги сите податоци",
    showQrTitle: "Вашиот QR код",
    showQrSubtitle: "Прикажете го ова за да го добиете вашиот печат.",
    btnClose: "Затвори",
    drinkPickerTitle: "Избери пијалак",
    drinkPickerSubtitle: "Пијалаци со двојна доза (пр. Фредо еспресо) носат 2 печати!",
    drinkStandardName: "Стандардно кафе / чај",
    drinkStandardDesc: "Еспресо, Лате, Американо",
    stamp1: "+1 печат",
    drinkMatchaName: "Мача",
    drinkMatchaDesc: "Топла или ладна церемонијална мача",
    stamp2: "+2 печати",
    drinkFreddoName: "Фредо еспресо",
    drinkFreddoDesc: "Наш препознатлив двоен ладен еспресо",
    drinkSpecialtyName: "Специјална комбинација",
    drinkSpecialtyDesc: "Повеќе ставки или голема нарачка",
    stamp3: "+3 печати",
    editCustomerTitle: "Уреди клиент",
    labelDisplayName: "Име за прикажување",
    labelPhoneUsername: "Телефон / Корисничко име",
    labelResetPassword: "Ресетирај лозинка (оставете празно за прескокнување)",
    btnDeleteCard: "Избриши картичка",
    btnSaveChanges: "Зачувај промени",
    btnIAgree: "Се согласувам",
    btnGotIt: "Разбрав",
    avatarModalTitle: "Избери аватар",
    avatarModalSubtitle: "Изберете икона за вашата картичка",
    installGuideSubtitle: "Инсталирајте ја Eightysix° за инстантен пристап на цел екран и офлајн поддршка.",
    installStep1Title: "Допрете на иконата за споделување",
    installStep1Desc: "Допрете на копчето <strong>Сподели</strong> на дното од екранот на прелистувачот",
    installStep2Title: 'Изберете „Додади на почетен екран"',
    installStep2Desc: "Лизгајте надолу низ менито и допрете <strong>Додади на почетен екран</strong>",
    installStep3Title: 'Допрете „Додади"',
    installStep3Desc: "Потврдете со допир на <strong>Додади</strong> во горниот десен агол",
    scanQrTitle: "Скенирај QR код на клиент",
    scanQrSubtitle: "Насочете ја камерата кон QR кодот на клиентот.",
    btnCancelScan: "Откажи скенирање",
    rewardTitle: "БЕСПЛАТНО КАФЕ ОТКЛУЧЕНО",
    rewardSubtitle: "Собравте 10 печати! Прикажете му на бариста за да го искористите или зачувајте го во вашиот паричник за подоцна.",
    btnRedeemNow: "Искористи сега на шанкот",
    btnKeepWallet: "Зачувај во паричник и ресетирај картичка",
    milestoneTitle: "Достигнато {tier} ниво",
    milestoneSubtitle: "Штотуку го достигнавте статусот {tier} — уживајте {n} бонус печати!",
    btnAwesome: "Одлично!",
    staffAccessTitle: "Пристап за вработени",
    staffAccessSubtitle: "Внесете ПИН за пристап до опциите за вработени.",
    labelName: "Име",
    labelCategory: "Категорија",
    labelSubtext: "Поднаслов (опционално)",
    labelPrice: "Цена",
    labelBonusStamps: "Бонус печати",
    labelStudentPrice: "Студентска цена (опционално)",
    menuItemDiscountPreview: "Тоа е {n}% попуст од редовната цена",
    menuViewRegular: "Редовно",
    menuViewStudent: "Студентско",
    menuNewSectionOption: "+ Додади нова секција…",
    phNewSectionName: "Име на новата секција",
    menuSectionEmpty: "празна",
    menuSectionDeleted: "Секцијата е избришана",
    errSectionNameRequired: "Внесете име за новата секција",
    btnDelete: "Избриши",
    btnSave: "Зачувај",
    settingsChangeDisplayName: "Име за прикажување",
    btnSkipForNow: "Подоцна",
    notifPanelTitle: "Известувања",
    notifPanelEmpty: "Сè е ажурирано — сè уште нема известувања.",
    btnClearAll: "Избриши сè",
    timeJustNow: "Сега",
    timeMinutesAgo: "пред {n}м",
    timeHoursAgo: "пред {n}ч",
    timeDaysAgo: "пред {n}д",
    settingsFriends: "Пријатели",
    settingsFriendsSub: "Подарете бесплатно кафе некому",
    friendsModalTitle: "Пријатели",
    friendsModalSubtitle: "Испратете барање за пријателство по нивното име за прикажување. Штом прифати, можете да си подарувате бесплатно кафе.",
    phFriendName: "Име за прикажување на пријателот",
    errEnterFriendName: "Ве молиме внесете име",
    btnAddFriend: "Додај",
    friendRequestsLabel: "Барања за пријателство",
    friendsListLabel: "Ваши пријатели",
    friendsEmpty: "Сè уште немате пријатели — испратете барање погоре.",
    errFriendNotFound: "Не е пронајдена сметка со тоа име",
    errCannotAddSelf: "Не можете да се додадете себеси",
    toastFriendAdded: "{name} е додаден како пријател!",
    toastFriendRequestSent: "Барањето за пријателство е испратено до {name}",
    toastFriendRequestAccepted: "Вие и {name} сега сте пријатели!",
    errAlreadyFriends: "Веќе сте пријатели со {name}",
    errAlreadyPending: "Веќе испративте барање до {name}",
    errNotFriends: "Веќе не сте пријатели со оваа личност",
    btnAcceptRequest: "Прифати",
    btnDeclineRequest: "Одбиј",
    btnGiftReward: "Подари бесплатно кафе",
    errNoRewardToGift: "Немате бесплатно кафе за подарување во моментов",
    confirmGiftTitle: "Да го подарите ова?",
    confirmGiftText: "Испратете го вашето бесплатно кафе до {name}? Ова не може да се врати.",
    btnConfirmGift: "Испрати подарок",
    toastGiftSent: "Подарокот е испратен! 🎁",
    confirmRemoveFriendTitle: "Отстрани пријател?",
    confirmRemoveFriendText: "Да го отстраните {name}? Ќе треба да испратите ново барање за повторно да се додадете.",
    btnConfirmRemoveFriend: "Отстрани",
    loadingText: "Се вчитува…",
    setDisplayNameTitle: "Име за прикажување",
    setDisplayNameSubtitle: "Името прикажано на вашата картичка, и по кое пријателите ве наоѓаат и додаваат. Може да се менува секои 14 дена.",
    toastDisplayNameSaved: "Името е зачувано!",
    homeGreetingGuest: "Здраво, Гостин",
    hiName: "Здраво, {name}",
    homeSubtitleGuest: "Најавете се или замолете вработен да направи картичка.",
    homeSubtitleRewardReady: "★ Наградата е спремна за искористување",
    progressMsgRewardReady: "Наградата е освоена! Прикажете му на бариста за да ја искористите.",
    homeSubtitleDigital: "Дигитална картичка за лојалност",
    progressMsgStampsNeeded: "Уште {n}!",
    menuModalEditItem: "Уреди ставка",
    menuModalAddItem: "Додади нова ставка",
    loggedInAs: "Најавени сте како {name}",
    phStaffEmail: "Е-пошта на вработен",
    btnStaffLogin: "Најави се",
    authDividerOr: "или",
    btnCustomerGoogleLogin: "Продолжи со Google",
    btnVoidRedemption: "Поништи последно искористување",
    sortRecent: "Неодамнешни",
    sortRegulars: "Редовни",
    settingsCampaign: "Кампања со печати",
    campaignDoubleStamps: "Двојни печати",
    campaignInactive: "Неактивна",
    badge_bronze: "Бронза",
    badge_silver: "Сребро",
    badge_gold: "Злато",
    badge_platinum: "Платина",
    menuBonusNoteTitle: "Бонус за двојна доза",
    menuBonusNoteBody: "Пијалаците со двојна доза (пр. Фредо еспресо) носат <strong>2 печати</strong> наместо 1. Секои 10 печати отклучуваат 1 бесплатно кафе.",
    catEspressoBased: "Еспресо пијалаци",
    catInstantCoffee: "Инстант кафе",
    catMatchaSpecialty: "Мача и специјалитети",
    catSoftDrinks: "Безалкохолни пијалаци",
    catWarmComfort: "Топли пијалаци",
    leaderboardTitle: "Ранг листа",
    leaderboardSubtitle: "Рангирано според освоени печати",
    leaderboardSubtitleMonthly: "Рангирано според печати освоени овој месец",
    leaderboardEmpty: "Сè уште никој не е на табелата — биди прв!",
    leaderboardYourRank: "Твојот ранг",
    leaderboardNotRanked: "Освои го твојот прв печат за да се приклучиш на табелата!",
    lifetimeStampsShort: "печати",
    lbPeriodAllTime: "Досега",
    lbPeriodMonthly: "Овој месец",
    settingsLeaderboard: "Табела на лидери",
    campaignBannerTitle: "Двојни печати денес!",
    campaignBannerSubtitle: "Секоја нарачка носи 2x печати во моментов"
  },
  sq: {
    posterBadge: "KARTA ZYRTARE E BESNIKËRISË",
    posterHeadline: "MERR KAFE FALAS",
    posterSubheadline: "Skano kodin QR me kamerën e telefonit për të aktivizuar Kartën Virtuale Eightysix°. Mblidh vula dhe zhblloko pije falas!",
    posterQrCaption: "DREJTO KAMERËN PËR TË SKANUAR",
    posterFeature1: "vulë për kafe",
    posterFeature2: "Dozë e Dyfishtë = 2 vula",
    posterFeature3: "vula = kafe falas",
    signupTitle: "Mirë se vini",
    signupSubtitle: "Merrni kartën tuaj virtuale ose gjeni një ekzistuese.",
    signupSubtitleNew: "Merrni kartën tuaj virtuale brenda pak sekondash.",
    signupSubtitleFind: "Vendosni emrin e përdoruesit dhe fjalëkalimin për t'u kthyer te karta juaj.",
    tabNewCard: "Kartë e Re",
    tabFindCard: "Gjej Kartën Time",
    phDisplayName: "Emri i shfaqur (p.sh. Alex)",
    phUsername: "Emri i përdoruesit (për identifikim)",
    phPassword: "Fjalëkalimi (8+ shkronja)",
    phPasswordConfirm: "Konfirmo Fjalëkalimin",
    pwReqLength: "8+ shkronja",
    pwReqUpper: "Shkronjë e madhe",
    pwReqLower: "Shkronjë e vogël",
    pwReqNumber: "Numër",
    errPasswordMismatch: "Fjalëkalimet nuk përputhen",
    errChooseUsername: "Ju lutemi zgjidhni një emër përdoruesi",
    errChooseDisplayName: "Ju lutemi vendosni një emër shfaqjeje",
    errDisplayNameRateLimited: "Mund ta ndryshoni emrin tuaj përsëri më {date}",
    errDisplayNameTaken: "Ai emër përdoret tashmë nga një kartë tjetër — provo të shtosh një inicial ose numër",
    errPasswordMinLength: "Fjalëkalimi duhet të ketë të paktën 6 karaktere",
    errPasswordWeak: "Fjalëkalimi duhet të ketë 8+ shkronja, një shkronjë të madhe, një të vogël dhe një numër",
    errUsernameTaken: "Ky emër përdoruesi është i zënë. Fjalëkalim i gabuar? Përdor \"Gjej Kartën Time\" për t'u identifikuar.",
    errInvalidSignupInput: "Vendos një emër përdoruesi dhe një fjalëkalim më të fortë",
    errServerConnection: "Nuk mund të lidhemi me serverin. Kontrollo lidhjen dhe provo përsëri.",
    errSessionExpired: "Sesioni juaj skadoi — ju lutemi identifikohuni përsëri.",
    errAcceptTos: "Ju lutemi pranoni Kushtet e Shërbimit dhe Politikën e Privatësisë",
    errSignupGeneric: "Diçka shkoi keq. Provo përsëri.",
    errEnterUsernamePassword: "Vendos emrin e përdoruesit dhe fjalëkalimin",
    errIncorrectLogin: "Emër përdoruesi ose fjalëkalim i gabuar",
    toastWelcomeNew: "Mirë se erdhe në Eightysix°!",
    toastWelcomeBack: "Mirë se u ktheve, {name}!",
    toastLoggedOut: "U çkyçe nga karta",
    updateAvailable: "Ka një version të ri — prek për të rifreskuar",
    btnCreateCard: "Krijo Kartën Time",
    phEnterUsername: "Vendos emrin e përdoruesit",
    phPasswordPlain: "Fjalëkalimi",
    btnLogin: "Identifikohu në Kartën Time",
    staffPortalTitle: "Portali i Stafit",
    staffPortalSubtitle: "Vetëm për stafin e autorizuar të Eightysix°",
    installBannerTitle: "Shto në Ekranin Kryesor",
    installBannerSubtitle: "Qasje e menjëhershme, punon edhe pa internet",
    installBannerBtn: "Instalo",
    walletTitle: "Portofoli i Shpërblimeve",
    walletCountSingular: "1 Kafe Falas Gati",
    walletCountPlural: "{n} Kafe Falas Gati",
    walletExpiredText: "Shpërblimi ka skaduar (1 vit pa u shfrytëzuar)",
    walletExpiresToday: "Skadon sot",
    walletExpiresInDay: "Skadon pas 1 dite",
    walletExpiresInDays: "Skadon pas {n} ditësh",
    btnRedeem: "Shfrytëzo",
    btnShowQr: "Shfaq Kodin Tim QR",
    addStampLabel: "SHTO VULË",
    btnRedeemBanked: "Shfrytëzo 1 Shpërblim të Ruajtur",
    btnRedeemBankedPlural: "Shfrytëzo {n} Shpërblime të Ruajtura",
    voidNoRedemption: "Nuk ka shfrytëzim për të anuluar për këtë klient",
    voidErrorConnection: "Nuk mund të anulohej — kontrollo lidhjen",
    voidSuccess: "Shfrytëzimi u anulua",
    btnMarkStudent: "Shëno si Student",
    btnUnmarkStudent: "Student ✓ (Prek për ta hequr)",
    studentBadgeLabel: "Student",
    studentStatusOn: "U shënua si student i verifikuar",
    studentStatusOff: "Statusi i studentit u hoq",
    studentStatusError: "Nuk mund të përditësohej — kontrollo lidhjen",
    cardBackTitle: "Statistikat e Tua",
    cardBackLifetimeStamps: "Vula Gjithsej",
    cardBackRedeemed: "Kafe të Shfrytëzuara",
    cardBackRank: "Renditja në Klasifikim",
    cardBackMemberSince: "Anëtar Që Nga",
    settingsStudentDiscount: "Zbritje për Studentë",
    studentPromoTitle: "Merr Zbritjen për Studentë",
    studentPromoSubtitle: "Regjistrohu në Netaville me email-in tënd të studentit, pastaj kërko stafit të të verifikojë",
    studentPromoBtn: "Aplikacioni Netaville",
    staffModeTitle: "Modaliteti i Stafit Aktiv",
    staffModeText: "Zgjidh një klient nga lista për ta parë dhe vulosur kartën.",
    navCard: "Karta",
    navMenu: "Menyja",
    navLeaderboard: "Renditja",
    navCustomers: "Klientët",
    navEditMenu: "Ndrysho Menynë",
    navActivity: "Aktiviteti",
    navSettings: "Cilësimet",
    btnAddItem: "+ Shto Artikull",
    phSearchCustomers: "Kërko emrin ose telefonin...",
    phSearchActivity: "Kërko ID e klientit ose veprimin...",
    filterAll: "Të gjitha",
    filterRedemptions: "Shfrytëzimet",
    filterStamps: "Vulat",
    dashboardTitle: "Cilësimet",
    statStampsToday: "Vula Sot",
    statRewardsGiven: "Shpërblime të Dhëna",
    statActiveCards: "Karta Aktive",
    settingsStoreInsights: "Statistikat e Dyqanit",
    statStampsWeek: "Vula Këtë Javë",
    statStampsMonth: "Vula Këtë Muaj",
    statRedemptionsMonth: "Shpërblime Këtë Muaj",
    statTopDrinksLabel: "Pijet Më Të Kërkuara — 30 Ditët e Fundit",
    settingsMyProfile: "Profili Im",
    statYourStampsToday: "Vula Sot",
    statYourRewardsToday: "Shpërblime Sot",
    statYourStampsTotal: "Vula Gjithsej",
    settingsLanguage: "Gjuha",
    settingsAccount: "Llogaria",
    settingsChooseAvatar: "Zgjidh Avatarin",
    settingsLogOut: "Dil",
    settingsAppLegal: "Aplikacioni & Ligjore",
    settingsTos: "Kushtet e Shërbimit",
    settingsPrivacy: "Politika e Privatësisë",
    tosSubtitle: "Kushtet e Programit të Besnikërisë Eightysix°",
    tosPara1: "<strong>1. Përmbledhje e Programit:</strong> Programi i Besnikërisë Eightysix° u lejon klientëve të fitojnë 1 vulë për çdo pije standarde (ose 2 vula për pije me dozë të dyfishtë si Freddo Espresso).",
    tosPara2: "<strong>2. Shpërblimi:</strong> Mbledhja e 10 vulave zhbllokon 1 Kafe Falas. Shpërblimet mund të shfrytëzohen në lokalet pjesëmarrëse të Eightysix° ose të ruhen në Portofolin tënd Dixhital të Shpërblimeve.",
    tosPara3: "<strong>3. Siguria e Llogarisë:</strong> Ju jeni përgjegjës për ruajtjen e konfidencialitetit të kredencialeve të llogarisë suaj. Fjalëkalimet duhet të plotësojnë kërkesat tona minimale të forcës (8+ shkronja, duke përfshirë një shkronjë të madhe, një të vogël dhe një numër).",
    tosPara4: "<strong>4. Identifikimi me Google:</strong> Nëse zgjidhni të vazhdoni me Google, llogaria juaj krijohet dhe identifikohet duke përdorur emrin dhe email-in tuaj nga Google. Përdorimi i Identifikimit me Google i nënshtrohet edhe Kushteve të Shërbimit të vetë Google-it.",
    privacySubtitle: "Si Eightysix° i mbron të dhënat tuaja",
    privacyPara1: "<strong>1. Mbledhja e të Dhënave:</strong> Mbledhim vetëm informacionin thelbësor (emrin e përdoruesit/emrin e shfaqjes dhe, në varësi të mënyrës së regjistrimit, numrin opsional të telefonit, fjalëkalimin, ose emrin dhe email-in nga llogaria Google) të nevojshëm për të identifikuar llogarinë tuaj dhe sinkronizuar vulat tuaja në të gjitha pajisjet.",
    privacyPara2: "<strong>2. Ruajtja dhe Siguria:</strong> Të dhënat enkriptohen lokalisht dhe sinkronizohen në mënyrë të sigurt me infrastrukturën Supabase Cloud, me kontrolle anti-manipulim. Fjalëkalimet nuk ruhen kurrë si tekst i thjeshtë — ruhet vetëm një hash kriptografik njëkahësh, i cili nuk mund të kthehet përsëri në fjalëkalimin tuaj.",
    privacyPara3: "<strong>3. Pa Ndarje me Palë të Treta:</strong> Informacioni juaj personal përdoret rreptësisht për shërbimet e besnikërisë të Eightysix° dhe nuk do të shitet apo ndahet kurrë.",
    privacyPara4: "<strong>4. Identifikimi me Google:</strong> Nëse përdorni \"Vazhdo me Google\", marrim vetëm emrin dhe email-in tuaj nga Google për të krijuar dhe identifikuar kartën tuaj — kurrë fjalëkalimin tuaj të Google-it, dhe nuk aksesojmë kurrë ndonjë pjesë tjetër të llogarisë suaj Google.",
    btnPrivacyAgree: "E Kuptoj",
    confirmRedeemTitle: "Të shfrytëzohet shpërblimi?",
    confirmRedeemSubtitle: "Kjo përdor 1 kafe falas nga portofoli dhe nuk mund të kthehet.",
    btnConfirmRedeem: "Shfrytëzo",
    btnCancel: "Anulo",
    btnDeleteAll: "Fshi të Gjitha të Dhënat",
    showQrTitle: "Kodi Yt QR",
    showQrSubtitle: "Tregoja këtë baristës për të marrë vulat e tua.",
    btnClose: "Mbyll",
    drinkPickerTitle: "Zgjidh Pijen",
    drinkPickerSubtitle: "Pijet me dozë të dyfishtë si Freddo Espresso fitojnë 2 vula!",
    drinkStandardName: "Kafe / Çaj Standard",
    drinkStandardDesc: "Espresso, Latte, Americano",
    stamp1: "+1 Vulë",
    drinkMatchaName: "Matcha",
    drinkMatchaDesc: "Matcha Ceremoniale e Ngrohtë ose e Ftohtë",
    stamp2: "+2 Vula",
    drinkFreddoName: "Freddo Espresso",
    drinkFreddoDesc: "Espreso i Ftohtë i Dyfishtë, Special i Yni",
    drinkSpecialtyName: "Kombinim Special",
    drinkSpecialtyDesc: "Disa artikuj ose porosi e madhe",
    stamp3: "+3 Vula",
    editCustomerTitle: "Ndrysho Klientin",
    labelDisplayName: "Emri i Shfaqur",
    labelPhoneUsername: "Telefoni / Emri i Përdoruesit",
    labelResetPassword: "Rivendos Fjalëkalimin (lëre bosh për ta anashkaluar)",
    btnDeleteCard: "Fshi Kartën",
    btnSaveChanges: "Ruaj Ndryshimet",
    btnIAgree: "Pajtohem",
    btnGotIt: "E Kuptova",
    avatarModalTitle: "Zgjidh Avatarin",
    avatarModalSubtitle: "Zgjidh një ikonë për kartën tënde",
    installGuideSubtitle: "Instalo Eightysix° për qasje të menjëhershme me ekran të plotë dhe mbështetje pa internet.",
    installStep1Title: "Prek Ikonën e Ndarjes",
    installStep1Desc: "Prek butonin <strong>Ndaj</strong> në fund të ekranit të shfletuesit",
    installStep2Title: 'Zgjidh "Shto në Ekranin Kryesor"',
    installStep2Desc: "Shko poshtë në menu dhe prek <strong>Shto në Ekranin Kryesor</strong>",
    installStep3Title: 'Prek "Shto"',
    installStep3Desc: "Konfirmo duke prekur <strong>Shto</strong> në cepin e sipërm djathtas",
    scanQrTitle: "Skano Kodin QR të Klientit",
    scanQrSubtitle: "Drejto kamerën te kodi QR i klientit.",
    btnCancelScan: "Anulo Skanimin",
    rewardTitle: "KAFE FALAS U ZHBLLOKUA",
    rewardSubtitle: "Mblodhe 10 vula! Tregoja baristës për ta shfrytëzuar ose ruaje në portofolin tënd për më vonë.",
    btnRedeemNow: "Shfrytëzo Tani te Banaku",
    btnKeepWallet: "Ruaje në Portofol & Rivendos Kartën",
    milestoneTitle: "Niveli {tier} u arrit",
    milestoneSubtitle: "Sapo arrite statusin {tier} — shijo {n} vula bonus!",
    btnAwesome: "Fantastike!",
    staffAccessTitle: "Qasja e Stafit",
    staffAccessSubtitle: "Vendos PIN-in për të hyrë në veçoritë e stafit.",
    labelName: "Emri",
    labelCategory: "Kategoria",
    labelSubtext: "Nëntitulli (Opsional)",
    labelPrice: "Çmimi",
    labelBonusStamps: "Vula Bonus",
    labelStudentPrice: "Çmimi për Studentë (Opsionale)",
    menuItemDiscountPreview: "Kjo është {n}% zbritje nga çmimi i rregullt",
    menuViewRegular: "I Rregullt",
    menuViewStudent: "Student",
    menuNewSectionOption: "+ Shto Seksion të Ri…",
    phNewSectionName: "Emri i seksionit të ri",
    menuSectionEmpty: "bosh",
    menuSectionDeleted: "Seksioni u fshi",
    errSectionNameRequired: "Shkruaj një emër për seksionin e ri",
    btnDelete: "Fshi",
    btnSave: "Ruaj",
    settingsChangeDisplayName: "Emri i Shfaqur",
    btnSkipForNow: "Më vonë",
    notifPanelTitle: "Njoftimet",
    notifPanelEmpty: "Je i përditësuar — ende s'ka njoftime.",
    btnClearAll: "Pastro të gjitha",
    timeJustNow: "Tani",
    timeMinutesAgo: "{n}m më parë",
    timeHoursAgo: "{n}o më parë",
    timeDaysAgo: "{n}d më parë",
    settingsFriends: "Miqtë",
    settingsFriendsSub: "Dhuro një kafe falas dikujt",
    friendsModalTitle: "Miqtë",
    friendsModalSubtitle: "Dërgo një kërkesë miqësie me emrin e tij/saj të shfaqur. Sapo ta pranojë, mund t'i dhuroni njëri-tjetrit një kafe falas.",
    phFriendName: "Emri i shfaqur i mikut",
    errEnterFriendName: "Ju lutemi vendosni një emër",
    btnAddFriend: "Shto",
    friendRequestsLabel: "Kërkesa Miqësie",
    friendsListLabel: "Miqtë e tu",
    friendsEmpty: "Ende nuk ke miq — dërgo një kërkesë më lart.",
    errFriendNotFound: "Nuk u gjet asnjë llogari me atë emër",
    errCannotAddSelf: "Nuk mund ta shtosh veten",
    toastFriendRequestSent: "Kërkesa e miqësisë u dërgua te {name}",
    toastFriendRequestAccepted: "Ti dhe {name} tani jeni miq!",
    errAlreadyFriends: "Tashmë je mik me {name}",
    errAlreadyPending: "Tashmë i ke dërguar një kërkesë miqësie {name}",
    errNotFriends: "Nuk je më mik me këtë person",
    btnAcceptRequest: "Prano",
    btnDeclineRequest: "Refuzo",
    toastFriendAdded: "{name} u shtua si mik!",
    btnGiftReward: "Dhuro një kafe falas",
    errNoRewardToGift: "Nuk ke një kafe falas për të dhuruar tani",
    confirmGiftTitle: "Ta Dhurosh Këtë Shpërblim?",
    confirmGiftText: "Dërgo kafenë tënde falas te {name}? Kjo nuk mund të kthehet.",
    btnConfirmGift: "Dërgo Dhuratën",
    toastGiftSent: "Dhurata u dërgua! 🎁",
    confirmRemoveFriendTitle: "Të heq mikun?",
    confirmRemoveFriendText: "Të heq {name}? Do të duhet të dërgosh një kërkesë të re për ta shtuar përsëri.",
    btnConfirmRemoveFriend: "Hiq",
    loadingText: "Duke u ngarkuar…",
    setDisplayNameTitle: "Emri i Shfaqur",
    setDisplayNameSubtitle: "Emri i shfaqur në kartën tuaj, dhe si të gjejnë e shtojnë miqtë. Ndryshueshëm një herë në 14 ditë.",
    toastDisplayNameSaved: "Emri u ruajt!",
    homeGreetingGuest: "Përshëndetje, Mysafir",
    hiName: "Përshëndetje, {name}",
    homeSubtitleGuest: "Identifikohu ose kërko stafit të krijojë një kartë.",
    homeSubtitleRewardReady: "★ Shpërblimi Gati për t'u Shfrytëzuar",
    progressMsgRewardReady: "Shpërblimi u fitua! Tregoja baristës për ta shfrytëzuar.",
    homeSubtitleDigital: "Karta Dixhitale e Besnikërisë",
    progressMsgStampsNeeded: "Edhe {n}!",
    menuModalEditItem: "Ndrysho Artikullin",
    menuModalAddItem: "Shto Artikull të Ri",
    loggedInAs: "I identifikuar si {name}",
    phStaffEmail: "Email i Stafit",
    btnStaffLogin: "Identifikohu",
    authDividerOr: "ose",
    btnCustomerGoogleLogin: "Vazhdo me Google",
    btnVoidRedemption: "Anulo Shfrytëzimin e Fundit",
    sortRecent: "Të Fundit",
    sortRegulars: "Klientë të Rregullt",
    settingsCampaign: "Fushata e Vulave",
    campaignDoubleStamps: "Vula të Dyfishta",
    campaignInactive: "Joaktive",
    badge_bronze: "Bronz",
    badge_silver: "Argjend",
    badge_gold: "Ar",
    badge_platinum: "Platin",
    menuBonusNoteTitle: "Bonus për Dozë të Dyfishtë",
    menuBonusNoteBody: "Pijet me dozë të dyfishtë (p.sh. Freddo Espresso) fitojnë <strong>2 vula</strong> në vend të 1. Çdo 10 vula zhbllokojnë 1 kafe falas.",
    catEspressoBased: "Bazuar në Espresso",
    catInstantCoffee: "Kafe e Menjëhershme",
    catMatchaSpecialty: "Matcha & Speciale",
    catSoftDrinks: "Pije Freskuese",
    catWarmComfort: "Ngrohje e Këndshme",
    leaderboardTitle: "Renditja",
    leaderboardSubtitle: "Renditur sipas vulave të fituara gjithsej",
    leaderboardSubtitleMonthly: "Renditur sipas vulave të fituara këtë muaj",
    leaderboardEmpty: "Ende askush në renditje — bëhu i pari!",
    leaderboardYourRank: "Renditja Jote",
    leaderboardNotRanked: "Fito vulën e parë për t'u bashkuar në renditje!",
    lifetimeStampsShort: "vula",
    lbPeriodAllTime: "Gjithsej",
    lbPeriodMonthly: "Këtë Muaj",
    settingsLeaderboard: "Renditja",
    campaignBannerTitle: "Vula të Dyfishta Sot!",
    campaignBannerSubtitle: "Çdo porosi fiton 2x vula tani"
  }
};

function t(key, vars) {
  const dict = TRANSLATIONS[state.language] || TRANSLATIONS.en;
  let str = dict[key] !== undefined ? dict[key] : (TRANSLATIONS.en[key] !== undefined ? TRANSLATIONS.en[key] : key);
  if (vars) {
    Object.keys(vars).forEach(k => { str = str.replace(`{${k}}`, vars[k]); });
  }
  return str;
}

function applyLanguage(lang) {
  if (!TRANSLATIONS[lang]) lang = 'en';
  state.language = lang;
  document.documentElement.lang = lang;
  localStorage.setItem('86_language', lang);

  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    el.innerHTML = t(el.dataset.i18nHtml);
  });
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });

  // Re-apply dynamic strings that get overwritten by JS at runtime, so a
  // language switch doesn't revert them to a stale static default.
  try {
    const session = JSON.parse(localStorage.getItem('86_user_session') || 'null');
    if (session && session.name && DOM.userAccountLabel && !state.isAdmin) {
      DOM.userAccountLabel.textContent = t('loggedInAs', { name: session.name });
    }
  } catch (e) {}
  if (typeof updateCardUI === 'function' && state.selectedCustomerId) updateCardUI();
  if (typeof renderCustomerMenu === 'function') renderCustomerMenu();
  if (typeof renderLeaderboard === 'function' && state.currentView === 'view-leaderboard') renderLeaderboard();
}

// Password strength rules for new signups — matched server-side in
// signup_customer() so the requirement can't be bypassed by calling the
// RPC directly.
function getPasswordChecks(pw) {
  pw = pw || '';
  return {
    length: pw.length >= 8,
    upper: /[A-Z]/.test(pw),
    lower: /[a-z]/.test(pw),
    number: /[0-9]/.test(pw)
  };
}
function isPasswordStrong(pw) {
  const c = getPasswordChecks(pw);
  return c.length && c.upper && c.lower && c.number;
}

// Timeout helper to ensure network calls never freeze the UI
function withTimeout(promise, ms = 1500) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Network timeout')), ms))
  ]);
}

// Security Checksum Helper (Anti-Tampering Guard)
function computeIntegrityHash(c) {
  if (!c) return '';
  const str = `${c.id}:${c.stamps || 0}:${c.rewardsEarned || 0}:${c.phone || ''}:${c.avatar || 'person'}:${INTEGRITY_SALT}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return 'sig_' + Math.abs(hash).toString(36);
}

function verifyAndCleanCustomer(c) {
  if (!c) return null;
  if (!c.history) c.history = [];
  if (!c.avatar || !MONOCHROME_AVATARS[c.avatar]) c.avatar = 'person';
  // Ensure signature always matches customer's state
  c._sig = computeIntegrityHash(c);
  return c;
}

// ==========================================
// STATE MANAGEMENT
// ==========================================
const state = {
  isAdmin: false,
  language: 'en',
  currentView: 'view-home',
  leaderboardPeriod: 'all',
  customers: [],
  selectedCustomerId: null,
  myCustomerId: null,
  myToken: null,
  staffToken: null,
  staffName: null,
  staffAvatar: 'person',
  editingStaffAvatar: false,
  mandatoryDisplayNamePrompt: false,
  pinFailedAttempts: 0,
  pinLockoutUntil: 0,
  activityFilter: 'all', // 'all' | 'redemption' | 'stamp'
  customerSort: 'recent', // 'recent' | 'regulars'
  menuPriceView: 'regular', // 'regular' | 'student' — defaults to 'student' on entry for verified students
  menuPriceViewInitialized: false,
  editingCustomerId: null,
  campaign: null, // { active, multiplier, label } once fetched
  stats: {
    stampsToday: 0,
    rewardsGiven: 0,
    activeCards: 0
  },
  menuItems: [],
  menuCategories: [] // [{ name, sortOrder }], defines section order everywhere the menu renders
};

const defaultMenu = [
  { id: 'm1', name: 'Espresso', sub: 'Hot / Iced', price: '100', category: 'Espresso Based', stamps: 0 },
  { id: 'm2', name: 'Americano', sub: 'Hot / Iced', price: '100', category: 'Espresso Based', stamps: 0 },
  { id: 'm3', name: 'Flat White', sub: 'Hot / Iced', price: '120', category: 'Espresso Based', stamps: 0 },
  { id: 'm4', name: 'Cappuccino', sub: 'Hot / Iced', price: '120', category: 'Espresso Based', stamps: 0 },
  { id: 'm5', name: 'Latte', sub: 'Hot / Iced', price: '140', category: 'Espresso Based', stamps: 0 },
  { id: 'm6', name: 'Nescafé', sub: 'Hot / Iced', price: '140', category: 'Instant Coffee', stamps: 0 },
  { id: 'm7', name: 'Nescafé Decaf', sub: 'Hot / Iced', price: '150', category: 'Instant Coffee', stamps: 0 },
  { id: 'm8', name: 'Matcha', sub: 'Hot / Iced', price: '150', category: 'Matcha & Specialty', stamps: 0 },
  { id: 'm9', name: 'Ube', sub: 'Hot / Iced', price: '150', category: 'Matcha & Specialty', stamps: 0 },
  { id: 'm10', name: 'Add-ons (Strawberry, Peach, Mango)', sub: '', price: '20', category: 'Matcha & Specialty', stamps: 0 },
  { id: 'm11', name: 'Coca Cola / Zero', sub: '', price: '120', category: 'Soft Drinks', stamps: 0 },
  { id: 'm12', name: 'Sprite', sub: '', price: '120', category: 'Soft Drinks', stamps: 0 },
  { id: 'm13', name: 'San Pellegrino', sub: '', price: '100', category: 'Soft Drinks', stamps: 0 },
  { id: 'm14', name: 'Lipton Iced Tea', sub: '', price: '120', category: 'Soft Drinks', stamps: 0 },
  { id: 'm15', name: 'Natural Juice', sub: '', price: '120', category: 'Soft Drinks', stamps: 0 },
  { id: 'm16', name: 'Cocoa', sub: '', price: '120', category: 'Warm Comfort', stamps: 0 },
  { id: 'm17', name: 'Salep', sub: '', price: '120', category: 'Warm Comfort', stamps: 0 },
  { id: 'm18', name: 'Tea', sub: '', price: '80', category: 'Warm Comfort', stamps: 0 }
];

// Instant-boot local cache — the menu now lives in Supabase (see
// syncMenuFromCloud), but rendering from this cache first means the app
// doesn't have to wait on a network round-trip just to show the menu,
// and it still works offline. syncMenuFromCloud() overwrites this with
// the real data moments later on every load, and realtime keeps it
// current after that without needing a reload.
function loadMenu() {
  const saved = localStorage.getItem('86_menu');
  if (saved) {
    try {
      state.menuItems = JSON.parse(saved);
    } catch(e) { state.menuItems = defaultMenu; }
  } else {
    state.menuItems = defaultMenu;
  }
}

// Fetches the real menu from Supabase and replaces local state/cache/UI
// with it. Called on boot and again whenever realtime signals a change,
// so every device converges on the same menu within a moment of a staff
// edit — no reload required.
async function syncMenuFromCloud() {
  const [cloudMenu, cloudCategories] = await Promise.all([cloud.getMenu(), cloud.getCategories()]);
  if (cloudMenu) {
    state.menuItems = cloudMenu.length ? cloudMenu : defaultMenu;
    saveMenu();
  }
  if (cloudCategories) {
    state.menuCategories = cloudCategories;
    saveCategoriesCache();
  }
  renderCustomerMenu();
  renderAdminMenu();
}

function saveCategoriesCache() {
  localStorage.setItem('86_menu_categories', JSON.stringify(state.menuCategories));
}

// Instant-boot local cache, same reasoning as loadMenu() above — falls
// back to deriving an order from whatever categories are already on the
// cached menu items if this is the very first load before the table
// backing this exists locally yet.
function loadCategories() {
  const saved = localStorage.getItem('86_menu_categories');
  if (saved) {
    try {
      state.menuCategories = JSON.parse(saved);
      return;
    } catch (e) {}
  }
  const seen = [];
  (state.menuItems || []).forEach(item => {
    if (item.category && !seen.includes(item.category)) seen.push(item.category);
  });
  state.menuCategories = seen.map((name, i) => ({ name, sortOrder: i }));
}

function saveMenu() {
  localStorage.setItem('86_menu', JSON.stringify(state.menuItems));
}

// ==========================================
// SUPABASE CLOUD DATABASE
// ==========================================
function mapDbRowToCustomer(d) {
  return verifyAndCleanCustomer({
    id: d.id,
    name: d.name,
    phone: d.phone,
    stamps: d.stamps,
    rewardsEarned: d.rewards_earned,
    joinedAt: d.joined_at,
    history: d.history || [],
    avatar: d.avatar || 'person',
    totalStampsEarned: d.total_stamps_earned || 0,
    rewardBankedAt: d.reward_banked_at || null,
    isStudent: !!d.is_student
  });
}

const cloud = {
  init() {
    try {
      if (window.supabase && window.supabase.createClient) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('☁️ Supabase connected');
        return true;
      }
    } catch (e) {
      console.error('Supabase init failed:', e);
    }
    return false;
  },

  // Self-service avatar change, verified server-side against the
  // caller's own session token (password customers) or live Google
  // session (auth.uid()) — the RPC resolves identity itself, it's never
  // trusted from the client. Can only ever touch the caller's own row.
  async setAvatar(token, avatar) {
    if (!supabaseClient) return null;
    try {
      const res = await withTimeout(
        supabaseClient.rpc('customer_save_self', { p_token: token || null, p_avatar: avatar }),
        2500
      );
      if (res.error || !res.data || !res.data.length) return null;
      return mapDbRowToCustomer(res.data[0]);
    } catch (e) {
      console.error('Supabase call failed:', e && e.message);
      return null;
    }
  },

  // Staff overriding a selected customer's avatar at the counter.
  async staffSetAvatar(staffToken, customerId, avatar) {
    if (!supabaseClient || !staffToken) return null;
    try {
      const res = await withTimeout(
        supabaseClient.rpc('staff_set_avatar', { p_token: staffToken, p_customer_id: customerId, p_avatar: avatar }),
        2500
      );
      if (res.error || !res.data || !res.data.length) return null;
      return mapDbRowToCustomer(res.data[0]);
    } catch (e) {
      console.error('Supabase call failed:', e && e.message);
      return null;
    }
  },

  // Staff marking a customer as a verified student (or unmarking) — the
  // one-time flag that lets the customer's own QR/card screen carry the
  // student badge from then on, so staff never need a second app/QR.
  async staffSetStudentStatus(staffToken, customerId, isStudent) {
    if (!supabaseClient || !staffToken) return null;
    try {
      const res = await withTimeout(
        supabaseClient.rpc('staff_set_student_status', { p_token: staffToken, p_customer_id: customerId, p_is_student: isStudent }),
        2500
      );
      if (res.error || !res.data || !res.data.length) return null;
      return mapDbRowToCustomer(res.data[0]);
    } catch (e) {
      console.error('Supabase call failed:', e && e.message);
      return null;
    }
  },

  // Self-service redeem — server checks the caller's own rewards_earned/
  // stamps and expiry, then decrements atomically. There's no field the
  // caller sets directly, so there's nothing to forge.
  async redeemReward(token, method) {
    if (!supabaseClient) return { error: 'offline' };
    try {
      const res = await withTimeout(
        supabaseClient.rpc('customer_redeem_reward', { p_token: token || null, p_method: method }),
        4000
      );
      if (res.error) {
        const msg = res.error.message || '';
        if (msg.includes('reward_expired')) return { error: 'reward_expired' };
        if (msg.includes('no_reward_available') || msg.includes('not_enough_stamps')) return { error: 'not_ready' };
        console.error('Supabase call failed:', msg);
        return { error: 'unknown' };
      }
      if (!res.data || !res.data.length) return { error: 'unknown' };
      return { customer: mapDbRowToCustomer(res.data[0]) };
    } catch (e) {
      console.error('Supabase call failed:', e && e.message);
      return { error: 'offline' };
    }
  },

  async staffRedeemReward(staffToken, customerId, method) {
    if (!supabaseClient || !staffToken) return { error: 'offline' };
    try {
      const res = await withTimeout(
        supabaseClient.rpc('staff_redeem_reward', { p_token: staffToken, p_customer_id: customerId, p_method: method }),
        4000
      );
      if (res.error) {
        const msg = res.error.message || '';
        if (msg.includes('no_reward_available') || msg.includes('not_enough_stamps')) return { error: 'not_ready' };
        console.error('Supabase call failed:', msg);
        return { error: 'unknown' };
      }
      if (!res.data || !res.data.length) return { error: 'unknown' };
      return { customer: mapDbRowToCustomer(res.data[0]) };
    } catch (e) {
      console.error('Supabase call failed:', e && e.message);
      return { error: 'offline' };
    }
  },

  // Self-service "Keep in Wallet & Reset Card" — server requires the
  // caller's own row to actually have 10 stamps before banking a reward.
  async bankReward(token) {
    if (!supabaseClient) return { error: 'offline' };
    try {
      const res = await withTimeout(
        supabaseClient.rpc('customer_bank_reward', { p_token: token || null }),
        4000
      );
      if (res.error) return { error: 'not_ready' };
      if (!res.data || !res.data.length) return { error: 'unknown' };
      return { customer: mapDbRowToCustomer(res.data[0]) };
    } catch (e) {
      console.error('Supabase call failed:', e && e.message);
      return { error: 'offline' };
    }
  },

  async staffBankReward(staffToken, customerId) {
    if (!supabaseClient || !staffToken) return { error: 'offline' };
    try {
      const res = await withTimeout(
        supabaseClient.rpc('staff_bank_reward', { p_token: staffToken, p_customer_id: customerId }),
        4000
      );
      if (res.error) return { error: 'not_ready' };
      if (!res.data || !res.data.length) return { error: 'unknown' };
      return { customer: mapDbRowToCustomer(res.data[0]) };
    } catch (e) {
      console.error('Supabase call failed:', e && e.message);
      return { error: 'offline' };
    }
  },

  // Staff onboarding a customer whose card was created locally on their
  // own device and hasn't synced to the cloud yet (scanned at the
  // counter for the first time). Only inserts if the id doesn't already
  // exist — never overwrites an existing customer.
  async staffCreateCustomer(staffToken, customerId, name, phone) {
    if (!supabaseClient || !staffToken) return null;
    try {
      const res = await withTimeout(
        supabaseClient.rpc('staff_create_customer', { p_token: staffToken, p_customer_id: customerId, p_name: name, p_phone: phone }),
        8000
      );
      if (res.error) {
        // Log the real reason — a genuine network drop, a slow-mobile
        // timeout, and an actual server-side rejection (bad RLS, a
        // constraint violation, etc.) all end up here, and only one of
        // those is actually "check your connection".
        console.error('staffCreateCustomer failed:', res.error.message || res.error);
        return null;
      }
      if (!res.data || !res.data.length) return null;
      return mapDbRowToCustomer(res.data[0]);
    } catch (e) {
      console.error('staffCreateCustomer threw:', e && e.message);
      return null;
    }
  },

  // Create a new account, or — if the username is already taken and the
  // password matches — sign back into that existing account instead of
  // failing outright (lets returning customers "sign up" again safely).
  async signupCustomer(username, password, name) {
    if (!supabaseClient) return { error: 'offline' };
    try {
      const res = await withTimeout(
        supabaseClient.rpc('signup_customer', { p_username: username, p_password: password, p_name: name }),
        4000
      );
      if (res.error) {
        const msg = res.error.message || '';
        if (msg.includes('username_taken')) return { error: 'username_taken' };
        if (msg.includes('weak_password')) return { error: 'weak_password' };
        if (msg.includes('invalid_input')) return { error: 'invalid_input' };
        console.error('Supabase call failed:', msg);
        return { error: 'unknown' };
      }
      if (!res.data || !res.data.length) return { error: 'unknown' };
      const d = res.data[0];
      return { customer: mapDbRowToCustomer(d), isNew: d.is_new, token: d.token };
    } catch (e) {
      console.error('Supabase call failed:', e && e.message);
      return { error: 'offline' };
    }
  },

  async loginCustomer(username, password) {
    if (!supabaseClient) return null;
    try {
      const res = await withTimeout(
        supabaseClient.rpc('login_customer', { p_username: username, p_password: password }),
        4000
      );
      if (res.error || !res.data || !res.data.length) return null;
      const d = res.data[0];
      return { customer: mapDbRowToCustomer(d), token: d.token };
    } catch (e) {
      console.error('Supabase call failed:', e && e.message);
      return null;
    }
  },

  async pullCustomer(id) {
    if (!supabaseClient || !id) return null;
    try {
      const res = await withTimeout(
        supabaseClient.rpc('get_customer_by_id', { p_id: id }),
        4000
      );
      if (res.error || !res.data || !res.data.length) return null;
      return mapDbRowToCustomer(res.data[0]);
    } catch (e) {
      console.error('Supabase call failed:', e && e.message);
      return null;
    }
  },

  // Display name (customers.name — shown on the card/QR/leaderboard) is
  // deliberately separate from the login username (customers.phone):
  // rate-limited to once every 14 days, enforced server-side. On a
  // cooldown violation the RPC raises 'rate_limited:<ISO timestamp>' —
  // pull that timestamp out so the UI can say exactly when it unlocks.
  async setDisplayName(token, name) {
    if (!supabaseClient) return { error: 'offline' };
    try {
      const res = await withTimeout(
        supabaseClient.rpc('customer_set_display_name', { p_token: token || null, p_name: name }),
        4000
      );
      if (res.error) {
        const msg = res.error.message || '';
        if (msg.startsWith('rate_limited')) {
          const nextChangeAt = msg.split(':').slice(1).join(':').split('"')[0] || null;
          return { error: 'rate_limited', nextChangeAt };
        }
        if (msg.includes('name_taken')) return { error: 'name_taken' };
        if (msg.includes('invalid_input')) return { error: 'invalid_input' };
        return { error: 'unknown' };
      }
      if (!res.data || !res.data.length) return { error: 'unknown' };
      return { customer: mapDbRowToCustomer(res.data[0]) };
    } catch (e) {
      console.error('Supabase call failed:', e && e.message);
      return { error: 'offline' };
    }
  },


  // ---- In-app notification inbox ----
  // Separate from Web Push: this is the persistent record a customer
  // sees inside the app regardless of push permission state, written
  // server-side by the same trusted functions that already gate the
  // real underlying event (friend request, gift, reward banked).
  async listNotifications(token) {
    if (!supabaseClient) return [];
    try {
      const res = await withTimeout(supabaseClient.rpc('customer_list_notifications', { p_token: token || null }), 4000);
      if (res.error || !res.data) return [];
      return res.data.map(d => ({ id: d.id, type: d.type, title: d.title, body: d.body, data: d.data || {}, read: d.read, createdAt: d.created_at }));
    } catch (e) {
      return [];
    }
  },

  async unreadNotificationCount(token) {
    if (!supabaseClient) return 0;
    try {
      const res = await withTimeout(supabaseClient.rpc('customer_unread_notification_count', { p_token: token || null }), 4000);
      if (res.error || typeof res.data !== 'number') return 0;
      return res.data;
    } catch (e) {
      return 0;
    }
  },

  async markAllNotificationsRead(token) {
    if (!supabaseClient) return false;
    try {
      const res = await withTimeout(supabaseClient.rpc('customer_mark_all_notifications_read', { p_token: token || null }), 4000);
      return !res.error;
    } catch (e) {
      return false;
    }
  },

  async deleteNotification(token, notificationId) {
    if (!supabaseClient) return false;
    try {
      const res = await withTimeout(supabaseClient.rpc('customer_delete_notification', { p_token: token || null, p_notification_id: notificationId }), 4000);
      return !res.error;
    } catch (e) {
      return false;
    }
  },

  async clearAllNotifications(token) {
    if (!supabaseClient) return false;
    try {
      const res = await withTimeout(supabaseClient.rpc('customer_clear_all_notifications', { p_token: token || null }), 4000);
      return !res.error;
    } catch (e) {
      return false;
    }
  },

  // Fire-and-forget: staff calls this after an action that should notify
  // a customer (reward earned) or everyone (campaign blast). Never blocks
  // the action it's attached to — a slow or failed push send shouldn't
  // stop a stamp from registering.
  async sendPush({ staffToken, customerId, broadcast, title, body, url, customerToken, targetCustomerId, context }) {
    try {
      const res = await withTimeout(
        fetch('/api/send-push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ staffToken, customerId, broadcast, title, body, url, customerToken, targetCustomerId, context })
        }),
        6000
      );
      if (!res.ok) return { sent: 0 };
      return await res.json();
    } catch (e) {
      return { sent: 0 };
    }
  },

  // ---- Friends & gifting ----
  async sendFriendRequest(token, friendName) {
    if (!supabaseClient) return { error: 'offline' };
    try {
      const res = await withTimeout(
        supabaseClient.rpc('customer_send_friend_request', { p_token: token || null, p_friend_username: friendName }),
        4000
      );
      if (res.error) {
        const msg = res.error.message || '';
        if (msg.includes('friend_not_found')) return { error: 'not_found' };
        if (msg.includes('cannot_add_self')) return { error: 'self' };
        if (msg.includes('invalid_input')) return { error: 'invalid_input' };
        // A stale/expired customer_sessions token raises this server-side
        // (customer_id_from_caller) — surfacing it as a generic "check
        // your connection" error is actively misleading since the
        // backend is reachable and responded fine, the caller just isn't
        // authenticated anymore.
        if (msg.includes('unauthorized')) return { error: 'session_expired' };
        return { error: 'unknown' };
      }
      if (!res.data || !res.data.length) return { error: 'unknown' };
      const d = res.data[0];
      return { status: d.status, friend: { id: d.friend_id, name: d.friend_name, avatar: d.friend_avatar || 'person' } };
    } catch (e) {
      console.error('Supabase call failed:', e && e.message);
      return { error: 'offline' };
    }
  },

  async respondFriendRequest(token, requestId, accept) {
    if (!supabaseClient) return false;
    try {
      const res = await withTimeout(
        supabaseClient.rpc('customer_respond_friend_request', { p_token: token || null, p_request_id: requestId, p_accept: !!accept }),
        4000
      );
      return !res.error;
    } catch (e) {
      return false;
    }
  },

  async listPendingRequests(token) {
    if (!supabaseClient) return [];
    try {
      const res = await withTimeout(
        supabaseClient.rpc('customer_list_pending_requests', { p_token: token || null }),
        4000
      );
      if (res.error || !res.data) return [];
      return res.data.map(d => ({ requestId: d.request_id, id: d.requester_id, name: d.requester_name, avatar: d.requester_avatar || 'person' }));
    } catch (e) {
      return [];
    }
  },

  async removeFriend(token, friendId) {
    if (!supabaseClient) return false;
    try {
      const res = await withTimeout(
        supabaseClient.rpc('customer_remove_friend', { p_token: token || null, p_friend_id: friendId }),
        4000
      );
      return !res.error;
    } catch (e) {
      return false;
    }
  },

  async listFriends(token) {
    if (!supabaseClient) return [];
    try {
      const res = await withTimeout(
        supabaseClient.rpc('customer_list_friends', { p_token: token || null }),
        4000
      );
      if (res.error || !res.data) return [];
      return res.data.map(d => ({ id: d.friend_id, name: d.friend_name, avatar: d.friend_avatar || 'person' }));
    } catch (e) {
      return [];
    }
  },

  async giftReward(token, friendId) {
    if (!supabaseClient) return { error: 'offline' };
    try {
      const res = await withTimeout(
        supabaseClient.rpc('customer_gift_reward', { p_token: token || null, p_friend_id: friendId }),
        4000
      );
      if (res.error) {
        const msg = res.error.message || '';
        if (msg.includes('no_reward_available')) return { error: 'no_reward' };
        if (msg.includes('friend_not_found')) return { error: 'not_found' };
        if (msg.includes('not_friends')) return { error: 'not_friends' };
        console.error('Supabase call failed:', msg);
        return { error: 'unknown' };
      }
      if (!res.data || !res.data.length) return { error: 'unknown' };
      return { customer: mapDbRowToCustomer(res.data[0]) };
    } catch (e) {
      console.error('Supabase call failed:', e && e.message);
      return { error: 'offline' };
    }
  },

  async pullAllCustomers(staffToken) {
    if (!supabaseClient || !staffToken) return [];
    try {
      const res = await withTimeout(
        supabaseClient.rpc('staff_list_customers', { p_token: staffToken }),
        2000
      );
      if (res.error || !res.data) return [];
      return res.data.map(mapDbRowToCustomer);
    } catch (e) {
      return [];
    }
  },

  // ---- Staff auth ----
  async staffLogin(email, password) {
    if (!supabaseClient) return { error: 'offline' };
    try {
      const res = await withTimeout(
        supabaseClient.rpc('staff_login', { p_email: email, p_password: password }),
        4000
      );
      if (res.error || !res.data || !res.data.length) return { error: 'invalid' };
      const d = res.data[0];
      return { token: d.token, staffId: d.staff_id, name: d.name, email: d.email };
    } catch (e) {
      console.error('Supabase call failed:', e && e.message);
      return { error: 'offline' };
    }
  },

  // Staff-portal shortcut for the 3 whitelisted personal Gmail accounts —
  // if the caller already has a live Supabase Auth session from
  // "Continue with Google" (customer login), this exchanges it for a
  // staff session with no separate password. Returns null for anyone not
  // both signed in with Google AND on the google_email allowlist (see
  // supabase-staff-google-login.sql), so it fails closed for everyone else.
  async staffLoginGoogle() {
    if (!supabaseClient) return null;
    try {
      const res = await withTimeout(supabaseClient.rpc('staff_login_google'), 4000);
      if (res.error || !res.data || !res.data.length) return null;
      const d = res.data[0];
      return { token: d.token, staffId: d.staff_id, name: d.name, email: d.email };
    } catch (e) {
      console.error('Supabase call failed:', e && e.message);
      return null;
    }
  },

  async staffLogout(token) {
    if (!supabaseClient || !token) return;
    try {
      await withTimeout(supabaseClient.rpc('staff_logout', { p_token: token }), 2000);
    } catch (e) {}
  },

  async staffGetSelf(token) {
    if (!supabaseClient || !token) return null;
    try {
      const res = await withTimeout(supabaseClient.rpc('staff_get_self', { p_token: token }), 3000);
      if (res.error || !res.data || !res.data.length) return null;
      const d = res.data[0];
      return { staffId: d.staff_id, name: d.name, email: d.email, avatar: d.avatar || 'person' };
    } catch (e) {
      console.error('Supabase call failed:', e && e.message);
      return null;
    }
  },

  async staffSetOwnAvatar(token, avatar) {
    if (!supabaseClient || !token) return null;
    try {
      const res = await withTimeout(supabaseClient.rpc('staff_set_own_avatar', { p_token: token, p_avatar: avatar }), 3000);
      if (res.error || !res.data || !res.data.length) return null;
      const d = res.data[0];
      return { staffId: d.staff_id, name: d.name, email: d.email, avatar: d.avatar || 'person' };
    } catch (e) {
      console.error('Supabase call failed:', e && e.message);
      return null;
    }
  },

  // Kicks off the Google OAuth redirect for a customer. Supabase-js sends
  // the browser to Google and back; the actual customer find-or-create
  // happens in completeGoogleLogin() once we're back with a Supabase
  // Auth session.
  async startGoogleLogin() {
    if (!supabaseClient) return { error: 'offline' };
    try {
      const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + window.location.pathname,
          // Without this, Google silently reuses whatever Google session is
          // already active in the browser instead of showing the account
          // chooser — so logging out in-app and tapping "Continue with
          // Google" again just signs back into the same old account.
          queryParams: { prompt: 'select_account' }
        }
      });
      if (error) return { error: 'offline' };
      return { ok: true };
    } catch (e) {
      console.error('Supabase call failed:', e && e.message);
      return { error: 'offline' };
    }
  },

  // Exchanges an already-established Google/Supabase Auth session for a
  // customer record — creating one on first sign-in. The RPC derives the
  // email/identity from the verified JWT server-side (see
  // customer_login_google in supabase-customer-google-login.sql), so the
  // client can't claim to be a different Google user.
  async completeGoogleLogin() {
    if (!supabaseClient) return null;
    try {
      const res = await withTimeout(supabaseClient.rpc('customer_login_google'), 4000);
      if (res.error || !res.data || !res.data.length) return null;
      const d = res.data[0];
      return { customer: mapDbRowToCustomer(d), isNew: d.is_new };
    } catch (e) {
      console.error('Supabase call failed:', e && e.message);
      return null;
    }
  },

  // ---- Staff-attributed writes ----
  // Returns { customer } on success or { error, customer: null } on
  // failure — the error reason matters here (see caller) because "check
  // your connection" is actively misleading for a staff member who was
  // just online a second ago (an expired 24h session, or a customer
  // that genuinely never made it to the server, are both much more
  // likely day-to-day than a real network drop).
  async staffAddStamp(token, customerId, baseStamps, drinkName) {
    if (!supabaseClient) return { error: 'offline' };
    if (!token) return { error: 'session_expired' };
    try {
      const res = await withTimeout(
        supabaseClient.rpc('staff_add_stamp', { p_token: token, p_customer_id: customerId, p_base_stamps: baseStamps, p_drink_name: drinkName }),
        8000
      );
      if (res.error) {
        const msg = String(res.error.message || '');
        if (msg.includes('unauthorized')) return { error: 'session_expired' };

        // Customer exists locally (e.g. a QR scan whose staff_create_customer
        // call failed earlier and silently fell back to a local-only record)
        // but was never actually created server-side. Recreate it from the
        // local copy and retry once, instead of surfacing a "check your
        // connection" error for what's really a stale local record.
        if (msg.includes('customer_not_found')) {
          const local = await db.getCustomer(customerId);
          const created = await this.staffCreateCustomer(token, customerId, local ? local.name : 'Customer', local ? local.phone : '');
          if (!created) return { error: 'customer_missing' };
          const retry = await withTimeout(
            supabaseClient.rpc('staff_add_stamp', { p_token: token, p_customer_id: customerId, p_base_stamps: baseStamps, p_drink_name: drinkName }),
            8000
          );
          if (retry.error || !retry.data || !retry.data.length) return { error: 'customer_missing' };
          return { customer: mapDbRowToCustomer(retry.data[0]) };
        }
        // Anything else is a genuine server-side rejection, not a dropped
        // connection — log the real reason so it's actually diagnosable
        // instead of every unrecognized error reading as "network error".
        console.error('staffAddStamp failed:', msg);
        return { error: 'unknown' };
      }
      if (!res.data || !res.data.length) return { error: 'unknown' };
      return { customer: mapDbRowToCustomer(res.data[0]) };
    } catch (e) {
      console.error('staffAddStamp threw:', e && e.message);
      return { error: 'offline' };
    }
  },

  async staffRemoveStamp(token, customerId) {
    if (!supabaseClient || !token) return { error: 'offline' };
    try {
      const res = await withTimeout(
        supabaseClient.rpc('staff_remove_stamp', { p_token: token, p_customer_id: customerId }),
        4000
      );
      if (res.error) {
        const msg = res.error.message || '';
        if (msg.includes('no_stamps_to_remove')) return { error: 'no_stamps' };
        console.error('Supabase call failed:', msg);
        return { error: 'unknown' };
      }
      if (!res.data || !res.data.length) return { error: 'unknown' };
      return { customer: mapDbRowToCustomer(res.data[0]) };
    } catch (e) {
      console.error('Supabase call failed:', e && e.message);
      return { error: 'offline' };
    }
  },

  async staffVoidLastRedemption(token, customerId) {
    if (!supabaseClient || !token) return { error: 'offline' };
    try {
      const res = await withTimeout(
        supabaseClient.rpc('staff_void_last_redemption', { p_token: token, p_customer_id: customerId }),
        4000
      );
      if (res.error) {
        const msg = res.error.message || '';
        if (msg.includes('no_redemption_to_void')) return { error: 'no_redemption' };
        console.error('Supabase call failed:', msg);
        return { error: 'unknown' };
      }
      if (!res.data || !res.data.length) return { error: 'unknown' };
      return { customer: mapDbRowToCustomer(res.data[0]) };
    } catch (e) {
      console.error('Supabase call failed:', e && e.message);
      return { error: 'offline' };
    }
  },

  async staffEditCustomer(token, customerId, name, phone) {
    if (!supabaseClient || !token) return null;
    try {
      const res = await withTimeout(
        supabaseClient.rpc('staff_edit_customer', { p_token: token, p_customer_id: customerId, p_name: name, p_phone: phone }),
        4000
      );
      if (res.error || !res.data || !res.data.length) return null;
      return mapDbRowToCustomer(res.data[0]);
    } catch (e) {
      console.error('Supabase call failed:', e && e.message);
      return null;
    }
  },

  // In-person reset, no email required: staff (already logged in) verify
  // the customer at the counter and set a new password directly. Same
  // strength rule as normal signup, enforced server-side too.
  async staffResetCustomerPassword(token, customerId, newPassword) {
    if (!supabaseClient || !token) return { error: 'offline' };
    try {
      const res = await withTimeout(
        supabaseClient.rpc('staff_reset_customer_password', { p_token: token, p_customer_id: customerId, p_new_password: newPassword }),
        4000
      );
      if (res.error) {
        const msg = res.error.message || '';
        if (msg.includes('weak_password')) return { error: 'weak_password' };
        if (msg.includes('customer_not_found')) return { error: 'not_found' };
        console.error('Supabase call failed:', msg);
        return { error: 'unknown' };
      }
      return { ok: true };
    } catch (e) {
      console.error('Supabase call failed:', e && e.message);
      return { error: 'offline' };
    }
  },

  async staffDeleteCustomer(token, customerId) {
    if (!supabaseClient || !token) return false;
    try {
      const res = await withTimeout(
        supabaseClient.rpc('staff_delete_customer', { p_token: token, p_customer_id: customerId }),
        3000
      );
      return !res.error;
    } catch (e) {
      return false;
    }
  },

  // ---- Stamp campaign ----
  // period: 'all' (lifetime, default) or 'month' (calendar month to date).
  async getLeaderboard(limit, period) {
    if (!supabaseClient) return [];
    try {
      const isMonthly = period === 'month';
      const res = await withTimeout(
        supabaseClient.rpc(isMonthly ? 'get_leaderboard_monthly' : 'get_leaderboard', { p_limit: limit || 20 }),
        2500
      );
      if (res.error || !res.data) return [];
      return res.data.map(d => ({ name: d.name, avatar: d.avatar || 'person', totalStampsEarned: (isMonthly ? d.monthly_stamps : d.total_stamps_earned) || 0 }));
    } catch (e) {
      return [];
    }
  },

  async getMyRank(customerId, period) {
    if (!supabaseClient || !customerId) return null;
    try {
      const isMonthly = period === 'month';
      const res = await withTimeout(
        supabaseClient.rpc(isMonthly ? 'get_my_rank_monthly' : 'get_my_rank', { p_id: customerId }),
        2500
      );
      if (res.error || !res.data || !res.data.length) return null;
      const d = res.data[0];
      return { rank: d.my_rank, totalStampsEarned: (isMonthly ? d.monthly_stamps : d.total_stamps_earned) || 0 };
    } catch (e) {
      console.error('Supabase call failed:', e && e.message);
      return null;
    }
  },

  async getCampaignStatus() {
    if (!supabaseClient) return null;
    try {
      const res = await withTimeout(supabaseClient.rpc('get_campaign_status'), 2000);
      if (res.error || !res.data || !res.data.length) return null;
      const d = res.data[0];
      return { active: d.active, multiplier: d.multiplier, label: d.label };
    } catch (e) {
      console.error('Supabase call failed:', e && e.message);
      return null;
    }
  },

  async staffSetCampaign(token, active, multiplier, label) {
    if (!supabaseClient || !token) return null;
    try {
      const res = await withTimeout(
        supabaseClient.rpc('staff_set_campaign', { p_token: token, p_active: active, p_multiplier: multiplier, p_label: label }),
        3000
      );
      if (res.error || !res.data || !res.data.length) return null;
      const d = res.data[0];
      return { active: d.active, multiplier: d.multiplier, label: d.label };
    } catch (e) {
      console.error('Supabase call failed:', e && e.message);
      return null;
    }
  },

  // ---- Menu (public — no auth needed to read, staff token to write) ----
  async getMenu() {
    if (!supabaseClient) return null;
    try {
      const res = await withTimeout(
        supabaseClient.from('menu_items').select('*').order('created_at', { ascending: true }),
        4000
      );
      if (res.error || !res.data) return null;
      return res.data.map(d => ({ id: d.id, name: d.name, sub: d.sub || '', price: d.price, category: d.category, stamps: d.stamps || 0, studentPrice: d.student_price || '' }));
    } catch (e) {
      console.error('Supabase call failed:', e && e.message);
      return null;
    }
  },

  async staffUpsertMenuItem(token, item) {
    if (!supabaseClient || !token) return { error: 'offline' };
    try {
      const res = await withTimeout(
        supabaseClient.rpc('staff_upsert_menu_item', {
          p_token: token,
          p_id: item.id,
          p_name: item.name,
          p_sub: item.sub || '',
          p_price: item.price,
          p_category: item.category,
          p_stamps: item.stamps || 0,
          p_student_price: item.studentPrice || null
        }),
        4000
      );
      if (res.error || !res.data || !res.data.length) return { error: 'unknown' };
      const d = res.data[0];
      return { item: { id: d.id, name: d.name, sub: d.sub || '', price: d.price, category: d.category, stamps: d.stamps || 0, studentPrice: d.student_price || '' } };
    } catch (e) {
      console.error('Supabase call failed:', e && e.message);
      return { error: 'offline' };
    }
  },

  async staffDeleteMenuItem(token, id) {
    if (!supabaseClient || !token) return false;
    try {
      const res = await withTimeout(
        supabaseClient.rpc('staff_delete_menu_item', { p_token: token, p_id: id }),
        4000
      );
      return !res.error;
    } catch (e) {
      return false;
    }
  },

  async getCategories() {
    if (!supabaseClient) return null;
    try {
      const res = await withTimeout(
        supabaseClient.from('menu_categories').select('*').order('sort_order', { ascending: true }),
        4000
      );
      if (res.error || !res.data) return null;
      return res.data.map(d => ({ name: d.name, sortOrder: d.sort_order }));
    } catch (e) {
      console.error('Supabase call failed:', e && e.message);
      return null;
    }
  },

  // p_old_name null/empty creates a new section; set it to rename one
  // (the rename cascades onto every item filed under the old name).
  async staffUpsertCategory(token, oldName, newName, sortOrder) {
    if (!supabaseClient || !token) return { error: 'offline' };
    try {
      const res = await withTimeout(
        supabaseClient.rpc('staff_upsert_category', {
          p_token: token,
          p_old_name: oldName || null,
          p_new_name: newName,
          p_sort_order: (sortOrder === undefined || sortOrder === null) ? null : sortOrder
        }),
        4000
      );
      if (res.error) return { error: 'unknown' };
      return { categories: (res.data || []).map(d => ({ name: d.name, sortOrder: d.sort_order })) };
    } catch (e) {
      console.error('Supabase call failed:', e && e.message);
      return { error: 'offline' };
    }
  },

  async staffDeleteCategory(token, name) {
    if (!supabaseClient || !token) return false;
    try {
      const res = await withTimeout(
        supabaseClient.rpc('staff_delete_category', { p_token: token, p_name: name }),
        4000
      );
      return !res.error;
    } catch (e) {
      return false;
    }
  },

  // names is the full section list in the order it should display.
  async staffReorderCategories(token, names) {
    if (!supabaseClient || !token) return false;
    try {
      const res = await withTimeout(
        supabaseClient.rpc('staff_reorder_categories', { p_token: token, p_names: names }),
        4000
      );
      return !res.error;
    } catch (e) {
      return false;
    }
  },

  // Realtime menu sync — any staff edit, on any device, pushes to every
  // open app within moments. Global (not tied to a customer/staff id),
  // so this subscribes once at startup rather than on login.
  subscribeToMenu() {
    if (!supabaseClient) return;
    supabaseClient
      .channel('menu-items-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, () => {
        syncMenuFromCloud();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_categories' }, () => {
        syncMenuFromCloud();
      })
      .subscribe();
  },

  subscribeToCustomer(customerId) {
    if (!supabaseClient || !customerId) return;

    this.unsubscribe();
    console.log('📡 Subscribing to realtime for customer:', customerId);

    realtimeChannel = supabaseClient
      .channel(`customer-${customerId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'customers'
        },
        async (payload) => {
          console.log('📡 REALTIME EVENT RECEIVED:', payload);
          const newData = payload.new;
          if (!newData || (newData.id && newData.id !== customerId)) return;

          const updatedCustomer = mapDbRowToCustomer(newData);

          const localCustomer = await db.getCustomer(updatedCustomer.id);
          const previousStamps = localCustomer ? localCustomer.stamps : 0;
          const previousRewards = localCustomer ? (localCustomer.rewardsEarned || 0) : 0;

          await db.saveCustomer(updatedCustomer);
          state.customers = await db.getAllCustomers();

          if (state.selectedCustomerId === updatedCustomer.id || state.myCustomerId === updatedCustomer.id) {
            await updateCardUI();
            renderActivityList();
          }

          if (updatedCustomer.stamps > previousStamps) {
            const newIndex = updatedCustomer.stamps - 1;
            const cup = document.getElementById(`stamp-${newIndex}`);
            if (cup) {
              cup.classList.add('earning');
              setTimeout(() => cup.classList.remove('earning'), 600);
            }
            bumpStampCount();
            // New stamp entries are prepended, so [0] is the one that
            // just landed — its staffName tells the customer who rang
            // them up, since "New Stamp Received!" alone didn't.
            const latestEntry = updatedCustomer.history && updatedCustomer.history[0];
            const stampedBy = latestEntry && latestEntry.type === 'stamp' ? latestEntry.staffName : null;
            const stampedByAvatar = latestEntry && latestEntry.type === 'stamp' ? latestEntry.staffAvatar : null;
            showToast(stampedBy ? `New Stamp from ${stampedBy}!` : 'New Stamp Received!', 'success', { avatar: stampedByAvatar, duration: 3500 });

            if (updatedCustomer.stamps === MAX_STAMPS && !state.isAdmin) {
              playRewardSound();
              hapticPulse([30, 40, 30, 40, 60]);
              openModal(DOM.rewardOverlay);
              fireConfetti();
            } else if (!state.isAdmin) {
              playStampSound();
              hapticPulse(25);
            }
          } else if (updatedCustomer.rewardsEarned < previousRewards) {
            showToast('Reward Redeemed! ☕', 'success');
          } else if (updatedCustomer.stamps < previousStamps && updatedCustomer.stamps === 0) {
            showToast('Card reset for new stamps!', 'info');
          }
        }
      )
      .subscribe((status) => {
        console.log('📡 Realtime subscription status:', status);
      });

    startCloudPolling();
  },

  unsubscribe() {
    if (realtimeChannel && supabaseClient) {
      supabaseClient.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
    stopCloudPolling();
  }
};

let pollInterval = null;
function startCloudPolling() {
  stopCloudPolling();
  pollInterval = setInterval(async () => {
    const targetId = state.selectedCustomerId || state.myCustomerId;
    if (!targetId || state.isAdmin) return;

    try {
      const cloudCustomer = await cloud.pullCustomer(targetId);
      if (!cloudCustomer) return;

      const localCustomer = await db.getCustomer(targetId);
      const previousStamps = localCustomer ? localCustomer.stamps : 0;
      const previousTotalEarned = localCustomer ? localCustomer.totalStampsEarned : 0;

      if (!localCustomer || localCustomer.stamps !== cloudCustomer.stamps || localCustomer.rewardsEarned !== cloudCustomer.rewardsEarned
        || localCustomer.avatar !== cloudCustomer.avatar || localCustomer.totalStampsEarned !== cloudCustomer.totalStampsEarned) {
        console.log('🔄 Cloud polling updated customer card:', targetId, 'stamps:', cloudCustomer.stamps);
        await db.saveCustomer(cloudCustomer);
        state.customers = await db.getAllCustomers();

        if (state.selectedCustomerId === targetId || state.myCustomerId === targetId) {
          await updateCardUI();
        }

        if (cloudCustomer.stamps > previousStamps) {
          const latestEntry = cloudCustomer.history && cloudCustomer.history[0];
          const stampedBy = latestEntry && latestEntry.type === 'stamp' ? latestEntry.staffName : null;
          const stampedByAvatar = latestEntry && latestEntry.type === 'stamp' ? latestEntry.staffAvatar : null;
          showToast(stampedBy ? `New Stamp from ${stampedBy}!` : 'New Stamp Received!', 'success', { avatar: stampedByAvatar, duration: 3500 });
          if (cloudCustomer.stamps === MAX_STAMPS && !state.isAdmin) {
            openModal(DOM.rewardOverlay);
            fireConfetti();
          }
        }

        // Gold/Platinum milestone celebration — the bonus stamps
        // themselves were already granted server-side; this just
        // surfaces it the moment this device notices the crossing.
        if (!state.isAdmin && cloudCustomer.totalStampsEarned > previousTotalEarned) {
          const prevBadge = getEarnedBadge(previousTotalEarned);
          const newBadge = getEarnedBadge(cloudCustomer.totalStampsEarned);
          if (newBadge && newBadge.key !== (prevBadge && prevBadge.key) && (newBadge.key === 'gold' || newBadge.key === 'platinum')) {
            showMilestoneCelebration(newBadge.key, newBadge.key === 'platinum' ? 10 : 5);
          }
        }
      }
    } catch (e) {}
  }, 3000);
}

function stopCloudPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

// ==========================================
// LOCAL DATABASE (Fail-Safe IndexedDB)
// ==========================================
const db = {
  instance: null,

  async init() {
    return new Promise((resolve) => {
      try {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => {
          console.warn('IndexedDB error:', event.target.error);
          resolve();
        };

        request.onsuccess = (event) => {
          this.instance = event.target.result;
          resolve();
        };

        request.onupgradeneeded = (event) => {
          const database = event.target.result;
          if (!database.objectStoreNames.contains('customers')) {
            const store = database.createObjectStore('customers', { keyPath: 'id' });
            store.createIndex('name', 'name', { unique: false });
            store.createIndex('phone', 'phone', { unique: false });
          }
          if (!database.objectStoreNames.contains('stats')) {
            database.createObjectStore('stats', { keyPath: 'id' });
          }
        };
      } catch (err) {
        console.warn('IndexedDB open catch:', err);
        resolve();
      }
    });
  },

  async ensureInit() {
    if (!this.instance) {
      try {
        await this.init();
      } catch (e) {}
    }
  },

  async getAllCustomers() {
    await this.ensureInit();
    if (!this.instance) return [];
    return new Promise((resolve) => {
      try {
        const tx = this.instance.transaction('customers', 'readonly');
        const store = tx.objectStore('customers');
        const request = store.getAll();
        request.onsuccess = () => {
          const res = (request.result || []).map(verifyAndCleanCustomer);
          resolve(res);
        };
        request.onerror = () => resolve([]);
      } catch (e) {
        resolve([]);
      }
    });
  },

  async getCustomer(id) {
    await this.ensureInit();
    if (!this.instance || !id) return null;
    return new Promise((resolve) => {
      try {
        const tx = this.instance.transaction('customers', 'readonly');
        const store = tx.objectStore('customers');
        const request = store.get(id);
        request.onsuccess = () => {
          resolve(verifyAndCleanCustomer(request.result));
        };
        request.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
  },

  async addCustomer(name, phone, specificId = null) {
    await this.ensureInit();
    const id = specificId || 'cust_' + Math.random().toString(36).substr(2, 9).toUpperCase();
    let newCustomer = {
      id,
      name,
      phone,
      stamps: 0,
      rewardsEarned: 0,
      joinedAt: new Date().toISOString(),
      history: [],
      avatar: 'person',
      totalStampsEarned: 0,
      rewardBankedAt: null
    };
    newCustomer._sig = computeIntegrityHash(newCustomer);

    if (!this.instance) return newCustomer;

    return new Promise((resolve) => {
      try {
        const tx = this.instance.transaction('customers', 'readwrite');
        const store = tx.objectStore('customers');
        const request = store.put(newCustomer);
        request.onsuccess = () => resolve(newCustomer);
        request.onerror = () => resolve(newCustomer);
      } catch (e) {
        resolve(newCustomer);
      }
    });
  },

  async saveCustomer(customer) {
    await this.ensureInit();
    if (!customer) return null;
    customer._sig = computeIntegrityHash(customer);
    if (!this.instance) return customer;

    return new Promise((resolve) => {
      try {
        const tx = this.instance.transaction('customers', 'readwrite');
        const store = tx.objectStore('customers');
        const request = store.put(customer);
        request.onsuccess = () => resolve(customer);
        request.onerror = () => resolve(customer);
      } catch (e) {
        resolve(customer);
      }
    });
  },

  async deleteCustomer(id) {
    await this.ensureInit();
    if (!this.instance || !id) return;
    return new Promise((resolve) => {
      try {
        const tx = this.instance.transaction('customers', 'readwrite');
        const store = tx.objectStore('customers');
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
      } catch (e) {
        resolve();
      }
    });
  },
};

// ==========================================
// DOM ELEMENTS
// ==========================================
const DOM = {
  views: document.querySelectorAll('.view'),
  viewHome: document.getElementById('view-home'),
  viewSplash: document.getElementById('view-splash'),
  viewSignup: document.getElementById('view-signup'),
  viewAdminLogin: document.getElementById('view-admin-login'),
  viewMenu: document.getElementById('view-menu'),
  viewAdminMenu: document.getElementById('view-admin-menu'),
  viewCustomers: document.getElementById('view-customers'),
  viewActivity: document.getElementById('view-activity'),
  viewSettings: document.getElementById('view-settings'),
  nav: document.getElementById('bottom-nav'),
  navItems: document.querySelectorAll('.nav-item'),
  customerNavItems: document.querySelectorAll('.customer-nav-item'),
  adminNavItems: document.querySelectorAll('.admin-nav-item'),

  // Sign Up / Login Tabs & Forms
  tabNewCard: document.getElementById('tab-new-card'),
  tabFindCard: document.getElementById('tab-find-card'),
  formNewCard: document.getElementById('form-new-card'),
  formFindCard: document.getElementById('form-find-card'),
  signupTitleText: document.getElementById('signup-title-text'),
  signupSubtitleText: document.getElementById('signup-subtitle-text'),
  signupName: document.getElementById('signup-name'),
  signupUsername: document.getElementById('signup-username'),
  signupPassword: document.getElementById('signup-password'),
  signupPasswordConfirm: document.getElementById('signup-password-confirm'),
  signupTosCheck: document.getElementById('signup-tos-check'),
  btnSignupSubmit: document.getElementById('btn-signup-submit'),
  loginUsername: document.getElementById('login-username'),
  loginPassword: document.getElementById('login-password'),
  btnLoginSubmit: document.getElementById('btn-login-submit'),
  btnCustomerGoogleLogin: document.getElementById('btn-customer-google-login'),

  // Links for ToS & Privacy Policy
  linkTos: document.getElementById('link-tos'),
  linkPrivacy: document.getElementById('link-privacy'),
  modalTos: document.getElementById('modal-tos'),
  overlayTos: document.getElementById('overlay-tos'),
  btnCloseTos: document.getElementById('btn-close-tos'),
  modalPrivacy: document.getElementById('modal-privacy'),
  overlayPrivacy: document.getElementById('overlay-privacy'),
  btnClosePrivacy: document.getElementById('btn-close-privacy'),

  // Staff Login
  staffLoginEmail: document.getElementById('staff-login-email'),
  staffLoginPassword: document.getElementById('staff-login-password'),
  staffLoginError: document.getElementById('staff-login-error'),
  btnStaffLoginSubmit: document.getElementById('btn-staff-login-submit'),
  btnStaffLoginCancel: document.getElementById('btn-staff-login-cancel'),
  btnRemoveStamp: document.getElementById('btn-remove-stamp'),
  appVersionText: document.getElementById('app-version-text'),

  // Home View
  stampGrid: document.getElementById('stamp-grid'),
  progressFill: document.getElementById('progress-fill'),
  stampCountText: document.getElementById('stamp-count-text'),
  stampCount: document.getElementById('stamp-count'),
  progressMsg: document.getElementById('progress-msg'),
  adminActions: document.getElementById('admin-actions'),
  btnAddStamp: document.getElementById('btn-add-stamp'),
  punchcard: document.getElementById('punchcard'),
  cardFlipInner: document.getElementById('card-flip-inner'),
  cardFaceFront: document.getElementById('card-face-front'),
  cardFaceBack: document.getElementById('card-face-back'),
  btnCardFlip: document.getElementById('btn-card-flip'),
  btnCardFlipBack: document.getElementById('btn-card-flip-back'),
  cardBackStatLifetime: document.getElementById('card-back-stat-lifetime'),
  cardBackStatRedeemed: document.getElementById('card-back-stat-redeemed'),
  cardBackStatRank: document.getElementById('card-back-stat-rank'),
  cardBackStatSince: document.getElementById('card-back-stat-since'),
  adminEmptyState: document.getElementById('admin-empty-state'),
  homeGreeting: document.getElementById('home-greeting'),
  homeSubtitle: document.getElementById('home-subtitle'),
  cardNumber: document.getElementById('card-number'),
  stampBadge: document.getElementById('stamp-badge'),
  stampBadgeLabel: document.getElementById('stamp-badge-label'),
  studentBadge: document.getElementById('student-badge'),
  btnToggleStudent: document.getElementById('btn-toggle-student'),
  btnToggleStudentLabel: document.getElementById('btn-toggle-student-label'),
  btnShowQr: document.getElementById('btn-show-qr'),
  studentPromoBanner: document.getElementById('student-promo-banner'),
  btnStudentPromoDownload: document.getElementById('btn-student-promo-download'),
  settingsStudentSection: document.getElementById('settings-student-section'),
  settingsStudentLink: document.getElementById('settings-student-link'),
  btnLogoutHeader: document.getElementById('btn-logout-header'),

  // Avatar Picker Elements
  btnChangeAvatar: document.getElementById('btn-change-avatar'),
  userAvatarDisplay: document.getElementById('user-avatar-display'),
  modalAvatarPicker: document.getElementById('modal-avatar-picker'),
  overlayAvatarPicker: document.getElementById('overlay-avatar-picker'),
  btnCloseAvatarPicker: document.getElementById('btn-close-avatar-picker'),
  avatarGrid: document.getElementById('avatar-grid'),

  // Rewards Wallet Element
  rewardsWalletCard: document.getElementById('rewards-wallet-card'),
  walletCountText: document.getElementById('wallet-count-text'),
  walletExpiryText: document.getElementById('wallet-expiry-text'),
  btnRedeemBanked: document.getElementById('btn-redeem-banked'),
  btnAdminRedeem: document.getElementById('btn-admin-redeem'),
  btnAdminRedeemLabel: document.getElementById('btn-admin-redeem-label'),
  btnVoidRedemption: document.getElementById('btn-void-redemption'),

  // Customers View
  customerList: document.getElementById('customer-list'),
  customerSearch: document.getElementById('customer-search'),
  btnNewCustomer: document.getElementById('btn-new-customer'),
  btnScanQr: document.getElementById('btn-scan-qr'),
  totalCustomersBadge: document.getElementById('total-customers-badge'),

  // Staff Edit Customer Modal
  modalEditCustomer: document.getElementById('modal-edit-customer'),
  overlayEditCustomer: document.getElementById('overlay-edit-customer'),
  editCustomerIdText: document.getElementById('edit-customer-id-text'),
  editCustomerName: document.getElementById('edit-customer-name'),
  editCustomerPhone: document.getElementById('edit-customer-phone'),
  editCustomerNewPassword: document.getElementById('edit-customer-new-password'),
  editCustomerPasswordError: document.getElementById('edit-customer-password-error'),
  btnSaveEditCustomer: document.getElementById('btn-save-edit-customer'),
  btnDeleteCustomer: document.getElementById('btn-delete-customer'),

  // Activity Log View
  activityList: document.getElementById('activity-list'),
  activitySearch: document.getElementById('activity-search'),
  totalActivityBadge: document.getElementById('total-activity-badge'),
  activityFilterChips: document.querySelectorAll('#activity-filter-chips .chip'),
  customerSortChips: document.querySelectorAll('#customer-sort-chips .chip'),

  // Settings View
  btnLogoutUser: document.getElementById('btn-logout-user'),
  userAccountLabel: document.getElementById('user-account-label'),
  campaignToggle: document.getElementById('campaign-toggle'),
  campaignStatusText: document.getElementById('campaign-status-text'),
  btnChangeDisplayName: document.getElementById('btn-change-displayname'),
  modalSetDisplayName: document.getElementById('modal-set-displayname'),
  overlaySetDisplayName: document.getElementById('overlay-set-displayname'),
  setDisplayNameInput: document.getElementById('set-displayname-input'),
  setDisplayNameError: document.getElementById('set-displayname-error'),
  btnSetDisplayNameSkip: document.getElementById('btn-set-displayname-skip'),
  btnSetDisplayNameSave: document.getElementById('btn-set-displayname-save'),
  btnOpenFriends: document.getElementById('btn-open-friends'),
  btnOpenFriendsHome: document.getElementById('btn-open-friends-home'),
  btnOpenNotifications: document.getElementById('btn-open-notifications'),
  notifBellBadge: document.getElementById('notif-bell-badge'),
  modalNotifications: document.getElementById('modal-notifications'),
  overlayNotifications: document.getElementById('overlay-notifications'),
  btnCloseNotifications: document.getElementById('btn-close-notifications'),
  notificationsList: document.getElementById('notifications-list'),
  btnClearAllNotifications: document.getElementById('btn-clear-all-notifications'),
  modalFriends: document.getElementById('modal-friends'),
  overlayFriends: document.getElementById('overlay-friends'),
  btnCloseFriends: document.getElementById('btn-close-friends'),
  addFriendInput: document.getElementById('add-friend-input'),
  btnAddFriend: document.getElementById('btn-add-friend'),
  addFriendError: document.getElementById('add-friend-error'),
  friendRequestsSection: document.getElementById('friend-requests-section'),
  friendRequestsList: document.getElementById('friend-requests-list'),
  friendsList: document.getElementById('friends-list'),
  modalConfirmGift: document.getElementById('modal-confirm-gift'),
  overlayConfirmGift: document.getElementById('overlay-confirm-gift'),
  confirmGiftText: document.getElementById('confirm-gift-text'),
  btnCancelGift: document.getElementById('btn-cancel-gift'),
  btnConfirmGift: document.getElementById('btn-confirm-gift'),
  modalConfirmRemoveFriend: document.getElementById('modal-confirm-remove-friend'),
  overlayConfirmRemoveFriend: document.getElementById('overlay-confirm-remove-friend'),
  confirmRemoveFriendText: document.getElementById('confirm-remove-friend-text'),
  btnCancelRemoveFriend: document.getElementById('btn-cancel-remove-friend'),
  btnConfirmRemoveFriend: document.getElementById('btn-confirm-remove-friend'),
  statStampsToday: document.getElementById('stat-stamps-today'),
  statRewardsGiven: document.getElementById('stat-rewards-given'),
  statActiveCards: document.getElementById('stat-active-cards'),
  btnStaffAvatar: document.getElementById('btn-staff-avatar'),
  staffAvatarDisplay: document.getElementById('staff-avatar-display'),
  staffProfileName: document.getElementById('staff-profile-name'),
  statMyStampsToday: document.getElementById('stat-my-stamps-today'),
  statMyRewardsToday: document.getElementById('stat-my-rewards-today'),
  statMyStampsTotal: document.getElementById('stat-my-stamps-total'),
  staffTeamStatsList: document.getElementById('staff-team-stats-list'),
  statStampsWeek: document.getElementById('stat-stamps-week'),
  statStampsMonth: document.getElementById('stat-stamps-month'),
  statRedemptionsMonth: document.getElementById('stat-redemptions-month'),
  topDrinksList: document.getElementById('top-drinks-list'),
  btnStaffLogout: document.getElementById('btn-staff-logout'),
  settingsTitle: document.getElementById('settings-title'),
  btnTosSettings: document.getElementById('btn-tos-settings'),
  btnPrivacySettings: document.getElementById('btn-privacy-settings'),
  secretAdminLogo: document.getElementById('secret-admin-logo'),

  // Legal Modals
  linkTos: document.getElementById('link-tos'),
  linkPrivacy: document.getElementById('link-privacy'),
  modalTos: document.getElementById('modal-tos'),
  overlayTos: document.getElementById('overlay-tos'),
  btnCloseTos: document.getElementById('btn-close-tos'),
  modalPrivacy: document.getElementById('modal-privacy'),
  overlayPrivacy: document.getElementById('overlay-privacy'),
  btnClosePrivacy: document.getElementById('btn-close-privacy'),

  // Modals

  modalConfirmRedeem: document.getElementById('modal-confirm-redeem'),
  overlayConfirmRedeem: document.getElementById('overlay-confirm-redeem'),
  btnConfirmRedeem: document.getElementById('btn-confirm-redeem'),
  btnCancelRedeem: document.getElementById('btn-cancel-redeem'),

  rewardOverlay: document.getElementById('reward-overlay'),
  milestoneOverlay: document.getElementById('milestone-overlay'),
  milestoneTitle: document.getElementById('milestone-title'),
  milestoneSubtitle: document.getElementById('milestone-subtitle'),
  btnCloseMilestone: document.getElementById('btn-close-milestone'),
  btnRedeemReward: document.getElementById('btn-redeem-reward'),
  btnCloseReward: document.getElementById('btn-close-reward'),

  // QR Modals
  modalShowQr: document.getElementById('modal-show-qr'),
  overlayShowQr: document.getElementById('overlay-show-qr'),
  btnCloseShowQr: document.getElementById('btn-close-show-qr'),
  qrcodeDisplay: document.getElementById('qrcode-display'),

  modalScanQr: document.getElementById('modal-scan-qr'),
  overlayScanQr: document.getElementById('overlay-scan-qr'),
  btnCancelScanQr: document.getElementById('btn-cancel-scan-qr'),

  // Promotional Poster
  posterQrcodeDisplay: document.getElementById('poster-qrcode-display'),

  // Toast
  toast: document.getElementById('toast'),
  toastIcon: document.getElementById('toast-icon'),
  toastMessage: document.getElementById('toast-message'),

  // Drink Selector Elements
  modalDrinkPicker: document.getElementById('modal-drink-picker'),
  overlayDrinkPicker: document.getElementById('overlay-drink-picker'),
  btnCancelDrinkPicker: document.getElementById('btn-cancel-drink-picker'),
  drinkOptionBtns: document.querySelectorAll('.drink-option-btn'),

  // Install Elements
  installBanner: document.getElementById('install-banner'),
  btnInstall: document.getElementById('btn-install'),
  btnCloseInstall: document.getElementById('btn-close-install'),
  btnInstallSettings: document.getElementById('btn-install-settings'),
  installSettingsLabel: document.getElementById('install-settings-label'),
  modalInstallGuide: document.getElementById('modal-install-guide'),
  overlayInstallGuide: document.getElementById('overlay-install-guide'),
  btnCloseInstallGuide: document.getElementById('btn-close-install-guide'),

  // Leaderboard Elements
  leaderboardContainer: document.getElementById('leaderboard-container'),
  leaderboardSubtitle: document.getElementById('leaderboard-subtitle'),
  leaderboardPeriodChips: document.querySelectorAll('#leaderboard-period-chips .chip'),
  menuPriceViewChips: document.querySelectorAll('#menu-price-view-chips .chip'),

  // Campaign Banner (Customer View)
  campaignBanner: document.getElementById('campaign-banner'),
  campaignBannerTitle: document.getElementById('campaign-banner-title'),
  campaignBannerSubtitle: document.getElementById('campaign-banner-subtitle'),

  // Menu Elements
  customerMenuContainer: document.getElementById('customer-menu-container'),
  adminMenuContainer: document.getElementById('admin-menu-container'),
  btnAddMenuItem: document.getElementById('btn-add-menu-item'),
  modalEditMenuItem: document.getElementById('modal-edit-menu-item'),
  overlayEditMenuItem: document.getElementById('overlay-edit-menu-item'),
  menuModalTitle: document.getElementById('menu-modal-title'),
  menuItemId: document.getElementById('menu-item-id'),
  menuItemName: document.getElementById('menu-item-name'),
  menuItemCategory: document.getElementById('menu-item-category'),
  menuItemCategoryNew: document.getElementById('menu-item-category-new'),
  menuItemSub: document.getElementById('menu-item-sub'),
  menuItemPrice: document.getElementById('menu-item-price'),
  menuItemStamps: document.getElementById('menu-item-stamps'),
  menuItemStudentPrice: document.getElementById('menu-item-student-price'),
  menuItemDiscountPreview: document.getElementById('menu-item-discount-preview'),
  btnSaveMenuItem: document.getElementById('btn-save-menu-item'),
  btnCancelMenuItem: document.getElementById('btn-cancel-menu-item'),
  btnDeleteMenuItem: document.getElementById('btn-delete-menu-item')
};

// ==========================================
// ROUTING HELPER (#admin URL Hash Listener)
// ==========================================
function handleHashRoute() {
  const hash = window.location.hash;
  const search = window.location.search;
  if (hash === '#admin' || search.includes('admin=true')) {
    document.documentElement.classList.add('staff-desktop-ok');
    switchView('view-admin-login');
    return true;
  }
  if (hash === '#poster' || hash === '#/poster') {
    document.documentElement.classList.add('staff-desktop-ok');
    switchView('view-poster');
    return true;
  }
  if (hash === '#signup' || hash === '#login') {
    switchView('view-signup');
    return true;
  }
  return false;
}

window.addEventListener('hashchange', handleHashRoute);
window.addEventListener('popstate', handleHashRoute);

// ==========================================
// CORE LOGIC & INITIALIZATION
// ==========================================

async function initApp() {
  let splashDismissed = false;
  const dismissSplash = (targetView = 'view-signup') => {
    if (splashDismissed) return;
    splashDismissed = true;
    if (DOM.viewSplash) {
      DOM.viewSplash.classList.add('fade-out');
      setTimeout(() => {
        DOM.viewSplash.classList.remove('active');
        if (!handleHashRoute()) {
          switchView(targetView);
        }
      }, 300);
    } else {
      if (!handleHashRoute()) {
        switchView(targetView);
      }
    }
  };

  // Hard ceiling: no single await inside init should ever be able to trap
  // a visitor on the splash screen forever. Everything network-bound
  // below already has its own timeout, but this is a last-resort net —
  // if something unexpected still hangs (e.g. indexedDB.open() never
  // firing, which has no timeout of its own), this fires regardless and
  // drops the visitor onto the sign-up screen instead of a dead splash.
  setTimeout(() => {
    if (!splashDismissed) {
      console.warn('App init exceeded 8s — forcing splash dismiss');
      dismissSplash('view-signup');
    }
  }, 8000);

  try {
    applyLanguage(localStorage.getItem('86_language') || 'en');
    document.querySelectorAll('.lang-btn').forEach(btn => {
      btn.addEventListener('click', () => applyLanguage(btn.dataset.lang));
    });

    // Signup screen's globe-icon language switcher: click to open/close the
    // popover, click a language to pick it (applyLanguage above already
    // fires for these buttons since they're plain .lang-btn elements too).
    const langGlobeBtn = document.getElementById('lang-globe-btn-signup');
    const langGlobeMenu = document.getElementById('lang-globe-menu-signup');
    if (langGlobeBtn && langGlobeMenu) {
      langGlobeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const willOpen = langGlobeMenu.classList.contains('hidden');
        langGlobeMenu.classList.toggle('hidden', !willOpen);
        langGlobeBtn.classList.toggle('active', willOpen);
        langGlobeBtn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
      });
      langGlobeMenu.querySelectorAll('.lang-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          langGlobeMenu.classList.add('hidden');
          langGlobeBtn.classList.remove('active');
          langGlobeBtn.setAttribute('aria-expanded', 'false');
        });
      });
      document.addEventListener('click', (e) => {
        if (!langGlobeMenu.classList.contains('hidden') && !langGlobeMenu.contains(e.target) && e.target !== langGlobeBtn) {
          langGlobeMenu.classList.add('hidden');
          langGlobeBtn.classList.remove('active');
          langGlobeBtn.setAttribute('aria-expanded', 'false');
        }
      });
    }

    await db.init().catch(() => {});
    cloud.init();
    state.customers = await db.getAllCustomers().catch(() => []);

    setupEventListeners();
    renderCustomersList();
    renderActivityList();
    initAvatarPickerModal();
    updateSettingsStats();
    initStampGrid();

    loadMenu();
    loadCategories();
    renderCustomerMenu();
    renderAdminMenu();
    syncMenuFromCloud();
    cloud.subscribeToMenu();
    // Realtime should push edits instantly, but websockets can silently
    // drop (backgrounded app, flaky connection) without an obvious
    // reconnect — this bounds how stale a displayed price can ever get
    // to well under a minute even if that happens.
    setInterval(syncMenuFromCloud, 45000);

    // Keeps the notification bell badge current while a customer just
    // sits on the home screen — a friend request or gift can land at any
    // time, not just when they happen to reopen the app.
    setInterval(() => { if (state.myCustomerId && !state.isAdmin) refreshNotifBadge(); }, 45000);

    // Load saved user session
    const savedUserJson = localStorage.getItem('86_user_session');
    if (savedUserJson) {
      try {
        const session = JSON.parse(savedUserJson);
        if (session && session.id) {
          state.myCustomerId = session.id;
          state.selectedCustomerId = session.id;
          state.myToken = session.token || null;
        }
      } catch (e) {}
    }

    // Returning from a Google OAuth redirect ("Continue with Google" on
    // the customer Welcome screen) — supabase-js parses the tokens out of
    // the URL as soon as the client is created, and getSession() waits
    // for that to finish. A successful exchange finds-or-creates the
    // matching customer row and restores it exactly like a normal saved
    // session below. Gated on the URL actually carrying OAuth tokens so a
    // completely ordinary guest visit (the overwhelming majority of page
    // loads) never pays for this extra network round-trip at all.
    // Checks both the hash (implicit flow: #access_token=...) and the
    // query string (PKCE flow: ?code=...) — supabase-js's default flow
    // can vary by SDK version, and only checking the hash meant a PKCE
    // return was silently ignored: the SDK had already exchanged the
    // code and stashed a valid session, but we'd never call getSession()
    // to notice it, so the app just fell through to the login screen as
    // if nothing had happened.
    const returningFromOAuth = /[#&?](access_token|error|code)=/.test(window.location.hash + window.location.search);
    if (!state.myCustomerId && supabaseClient && returningFromOAuth) {
      try {
        const { data } = await withTimeout(supabaseClient.auth.getSession(), 4000);
        if (data && data.session) {
          // Whitelisted staff Gmail accounts are admin-only — check that
          // first so those 3 emails never fall through to a regular
          // customer card. Everyone else's Google sign-in is unaffected.
          const staffResult = await cloud.staffLoginGoogle();
          if (staffResult) {
            await finishStaffLogin(staffResult);
          } else {
            const googleResult = await cloud.completeGoogleLogin();
            if (googleResult) {
              await db.saveCustomer(googleResult.customer);
              saveUserSession(googleResult.customer);
            } else {
              console.error('Google sign-in: session established but customer_login_google RPC failed');
              showToast('Google sign-in failed — please try again', 'error');
              await supabaseClient.auth.signOut().catch(() => {});
            }
          }
        } else if (/[#&?]error=/.test(window.location.hash + window.location.search)) {
          console.error('Google sign-in: OAuth redirect returned an error', window.location.hash || window.location.search);
          showToast('Google sign-in failed — please try again', 'error');
        }
      } catch (e) {
        console.error('Google sign-in: error while completing OAuth redirect', e);
        showToast('Google sign-in failed — please try again', 'error');
      }
      // Strip the OAuth params from the URL so a page refresh doesn't
      // re-run this block against a now-consumed/stale code or token.
      history.replaceState(null, '', window.location.pathname);
    }

    // Load saved staff session (tokens last 24h server-side; if it's
    // expired, the first staff action will just fail gracefully and the
    // person can log back in via Lock App / Settings).
    const savedStaffJson = localStorage.getItem('86_staff_session');
    if (savedStaffJson) {
      try {
        const staffSession = JSON.parse(savedStaffJson);
        if (staffSession && staffSession.token) {
          state.staffToken = staffSession.token;
          state.staffName = staffSession.name;
          state.staffAvatar = staffSession.avatar || 'person';
        }
      } catch (e) {}
    }

    let targetView = 'view-signup';
    const isSecretAdminRoute = window.location.hash === '#admin' || window.location.search.includes('admin=true');

    // A saved staff session should restore straight into admin mode on
    // any reload, not just when the URL happens to include #admin —
    // otherwise a returning staff member gets bounced to the customer
    // signup screen every time despite already being logged in.
    if (isSecretAdminRoute || state.staffToken) {
      if (state.staffToken) {
        toggleAdminMode(true);
        DOM.nav.classList.remove('hidden');
        targetView = 'view-customers';
        renderStaffProfile();
        try {
          const cloudCustomers = await cloud.pullAllCustomers(state.staffToken);
          if (cloudCustomers.length > 0) {
            for (const c of cloudCustomers) await db.saveCustomer(c);
            state.customers = await db.getAllCustomers();
            renderCustomersList();
            renderActivityList();
          }
        } catch (e) {}
      } else {
        targetView = 'view-admin-login';
      }
    } else if (state.myCustomerId) {
      let me = await db.getCustomer(state.myCustomerId).catch(() => null);
      let needsCloudRefresh = false;
      if (!me) {
        // No local IndexedDB copy (new device, cleared storage, or the
        // browser evicted it — common on iOS). Don't let a slow/cold
        // Supabase round-trip decide whether this reload bounces a
        // returning customer back to the signup screen: rebuild a minimal
        // card from the saved session immediately so the reload can never
        // "reset" a logged-in session, then reconcile with the cloud in
        // the background once it's reachable.
        try {
          const session = JSON.parse(localStorage.getItem('86_user_session') || 'null');
          if (session && session.id === state.myCustomerId) {
            me = {
              id: session.id,
              name: session.name || 'Customer',
              phone: session.phone || '',
              avatar: session.avatar || 'person',
              stamps: 0,
              rewardsEarned: 0,
              totalStampsEarned: 0,
              history: [],
              joinedAt: new Date().toISOString(),
              rewardBankedAt: null
            };
            await db.saveCustomer(me);
            needsCloudRefresh = true;
          }
        } catch (e) {}
      }
      if (me) {
        state.selectedCustomerId = me.id;
        const savedAvatar = localStorage.getItem(`86_user_avatar_${me.id}`);
        if (savedAvatar) me.avatar = savedAvatar;
        await db.saveCustomer(me);
        await updateCardUI();
        targetView = 'view-home';
        DOM.nav.classList.remove('hidden');
        toggleAdminMode(false);
        cloud.subscribeToCustomer(me.id);

        if (needsCloudRefresh) {
          cloud.pullCustomer(me.id).then(async (fresh) => {
            if (fresh && state.selectedCustomerId === fresh.id) {
              const avatar = localStorage.getItem(`86_user_avatar_${fresh.id}`);
              if (avatar) fresh.avatar = avatar;
              await db.saveCustomer(fresh);
              await updateCardUI();
              renderActivityList();
            }
          }).catch(() => {});
        }
      }
    }

    setTimeout(() => dismissSplash(targetView), 400);

    // NOTE: the full customer list is only fetched once staff unlock admin
    // mode with the PIN (see toggleAdminMode(true) call sites) — it used to
    // sync unconditionally for every visitor here, which meant every
    // customer's browser silently downloaded every other customer's data.

  } catch (err) {
    console.error('App init catch:', err);
    setTimeout(() => dismissSplash('view-signup'), 600);
  }

  // Service Worker — plus an update-available prompt. Without this, a
  // PWA that's just resumed from the background (not a full reload) can
  // silently keep running JS from before the last deploy indefinitely,
  // since the new service worker installs in the background but never
  // takes over an already-running page until it's told to.
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js')
        .then(reg => {
          console.log('SW registered:', reg.scope);

          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (!newWorker) return;
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                showUpdateBanner();
              }
            });
          });

          // Reopening/foregrounding the app is exactly when a stale
          // background tab is most likely to be sitting on an old
          // version, so check for updates right then too.
          document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') reg.update().catch(() => {});
          });
        })
        .catch(err => console.error('SW failed:', err));
    });
  }
}

function showUpdateBanner() {
  const banner = document.getElementById('update-banner');
  if (!banner || banner.classList.contains('show')) return;
  banner.classList.add('show');
  // The new service worker already calls skipWaiting()/clients.claim() on
  // its own, so it's active and in control well before this fires —
  // reloading is all that's needed to actually re-fetch and re-run the
  // new app.js instead of continuing on the copy already sitting in memory.
  const reload = () => window.location.reload();
  banner.addEventListener('click', reload, { once: true });

  // A banner that just sits there waiting to be tapped is too easy to
  // miss (an unattended kiosk tablet/TV will never tap it at all) —
  // auto-apply shortly after, unless someone's actively mid-keystroke in
  // a form, where losing a half-typed signup would be worse than a
  // few extra seconds on the old version.
  setTimeout(() => {
    const active = document.activeElement;
    const isTyping = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
    if (!isTyping) reload();
  }, 5000);
}


// token is only passed on an actual login/signup — omit it (e.g. when
// just refreshing the displayed name/avatar after a local edit) and the
// previously-stored session token is kept as-is. Google-login customers
// never get a token here; their identity comes from the live Supabase
// Auth session instead (see cloud.setAvatar/redeemReward/etc, which
// fall back to auth.uid() server-side when p_token is null).
function saveUserSession(customer, token) {
  state.myCustomerId = customer.id;
  state.selectedCustomerId = customer.id;
  if (token) state.myToken = token;

  const avatarKey = customer.avatar || localStorage.getItem(`86_user_avatar_${customer.id}`) || 'person';
  customer.avatar = avatarKey;
  localStorage.setItem(`86_user_avatar_${customer.id}`, avatarKey);

  const existing = JSON.parse(localStorage.getItem('86_user_session') || 'null');
  localStorage.setItem('86_user_session', JSON.stringify({
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    avatar: avatarKey,
    token: token || (existing && existing.id === customer.id ? existing.token : null) || null
  }));

  if (DOM.userAccountLabel) {
    DOM.userAccountLabel.textContent = t('loggedInAs', { name: customer.name });
  }

  cloud.subscribeToCustomer(customer.id);
}

function initAvatarPickerModal() {
  if (!DOM.avatarGrid) return;
  DOM.avatarGrid.innerHTML = '';

  AVATAR_SEEDS.forEach(key => {
    const btn = document.createElement('button');
    btn.className = 'avatar-option-btn';
    btn.dataset.avatar = key;
    btn.innerHTML = MONOCHROME_AVATARS[key];

    btn.addEventListener('click', async () => {
      if (state.isAdmin && state.editingStaffAvatar) {
        if (!state.staffToken) return;
        const saved = await cloud.staffSetOwnAvatar(state.staffToken, key);
        if (!saved) {
          showToast(t('errServerConnection'), 'error');
          return;
        }
        state.staffAvatar = saved.avatar;
        const staffSession = JSON.parse(localStorage.getItem('86_staff_session') || 'null');
        if (staffSession) {
          staffSession.avatar = saved.avatar;
          localStorage.setItem('86_staff_session', JSON.stringify(staffSession));
        }
        closeModal(DOM.modalAvatarPicker);
        renderStaffProfile();
        showToast('Avatar updated!', 'success');
        return;
      }

      const activeId = state.selectedCustomerId || state.myCustomerId;
      if (!activeId) return;
      const isSelf = !state.isAdmin && activeId === state.myCustomerId;

      let customer = await db.getCustomer(activeId);
      if (!customer) customer = await cloud.pullCustomer(activeId);
      if (!customer) return;

      const saved = isSelf
        ? await cloud.setAvatar(state.myToken, key)
        : await cloud.staffSetAvatar(state.staffToken, activeId, key);
      if (!saved) {
        showToast(t('errServerConnection'), 'error');
        return;
      }
      customer = saved;
      verifyAndCleanCustomer(customer);

      localStorage.setItem(`86_user_avatar_${customer.id}`, key);
      if (isSelf) saveUserSession(customer);

      await db.saveCustomer(customer);
      state.customers = await db.getAllCustomers();

      closeModal(DOM.modalAvatarPicker);
      await updateCardUI();
      renderCustomersList(DOM.customerSearch ? DOM.customerSearch.value : '');
      showToast('Avatar updated!', 'success');
    });

    DOM.avatarGrid.appendChild(btn);
  });
}

// Pressing Enter — which is what a mobile keyboard's "Next"/"Go" key
// actually sends — otherwise does nothing useful in a multi-field form
// (browsers only auto-advance/submit for single-input forms). This moves
// focus to the next input in the given container, or clicks the submit
// button from the last one.
function wireEnterKeyChain(container, submitBtn) {
  if (!container) return;
  const inputs = Array.from(container.querySelectorAll('input')).filter(
    el => el.type !== 'checkbox' && el.type !== 'hidden'
  );
  inputs.forEach((input, i) => {
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const next = inputs[i + 1];
      if (next) next.focus();
      else if (submitBtn) submitBtn.click();
    });
  });
}

function setupEventListeners() {
  wireEnterKeyChain(DOM.formNewCard, DOM.btnSignupSubmit);
  wireEnterKeyChain(DOM.formFindCard, DOM.btnLoginSubmit);
  wireEnterKeyChain(document.getElementById('view-admin-login'), DOM.btnStaffLoginSubmit);
  wireEnterKeyChain(document.getElementById('modal-edit-menu-item'), DOM.btnSaveMenuItem);
  wireEnterKeyChain(document.getElementById('modal-edit-customer'), DOM.btnSaveEditCustomer);
  wireEnterKeyChain(DOM.modalSetDisplayName, DOM.btnSetDisplayNameSave);

  // Navigation
  DOM.navItems.forEach(item => {
    item.addEventListener('click', () => switchView(item.dataset.target));
  });

  // Secret staff/admin entry point: tap the welcome-screen logo 5 times
  // within 3 seconds. Needed because #admin URL routing only works from
  // a browser address bar — once the app is installed to the home
  // screen, it always launches at the plain start_url with no hash, so
  // that route is unreachable from the installed icon with no other way
  // in.
  if (DOM.secretAdminLogo) {
    let tapCount = 0;
    let tapResetTimer = null;
    DOM.secretAdminLogo.addEventListener('click', () => {
      tapCount++;
      clearTimeout(tapResetTimer);
      tapResetTimer = setTimeout(() => { tapCount = 0; }, 3000);
      if (tapCount >= 5) {
        tapCount = 0;
        clearTimeout(tapResetTimer);
        switchView('view-admin-login');
      }
    });
  }

  // Show/Hide Password Toggles
  document.querySelectorAll('.toggle-password-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.target);
      if (!input) return;
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      btn.querySelector('.icon-eye').classList.toggle('hidden', !showing);
      btn.querySelector('.icon-eye-off').classList.toggle('hidden', showing);
    });
  });

  // Live password strength checklist — shared by the signup form and the
  // staff "Reset Password" field on the Edit Customer modal.
  const wirePasswordChecklist = (inputEl, requirementsContainerId) => {
    if (!inputEl) return;
    inputEl.addEventListener('input', () => {
      const checks = getPasswordChecks(inputEl.value);
      Object.entries(checks).forEach(([rule, met]) => {
        const el = document.querySelector(`#${requirementsContainerId} .pw-req[data-rule="${rule}"]`);
        if (el) el.classList.toggle('met', met);
      });
    });
  };
  wirePasswordChecklist(DOM.signupPassword, 'signup-password-requirements');
  wirePasswordChecklist(DOM.editCustomerNewPassword, 'edit-customer-password-requirements');

  // Avatar Picker Modal Trigger (from Settings)
  if (DOM.btnChangeAvatar) {
    DOM.btnChangeAvatar.addEventListener('click', () => {
      const activeId = state.selectedCustomerId || state.myCustomerId;
      if (!activeId) return;
      state.editingStaffAvatar = false;
      openModal(DOM.modalAvatarPicker);
    });
  }

  // Allow clicking the avatar on the home screen to change it
  if (DOM.userAvatarDisplay) {
    DOM.userAvatarDisplay.addEventListener('click', () => {
      const activeId = state.selectedCustomerId || state.myCustomerId;
      if (!activeId) return;
      state.editingStaffAvatar = false;
      openModal(DOM.modalAvatarPicker);
    });
    DOM.userAvatarDisplay.style.cursor = 'pointer';
  }

  if (DOM.btnCloseAvatarPicker) DOM.btnCloseAvatarPicker.addEventListener('click', () => closeModal(DOM.modalAvatarPicker));
  if (DOM.overlayAvatarPicker) DOM.overlayAvatarPicker.addEventListener('click', () => closeModal(DOM.modalAvatarPicker));

  // Change Display Name (Settings > Account) — the name shown on the
  // card/QR/leaderboard, and (since the friend-search-by-name migration)
  // also what friends search for, so it's the only "name" a customer
  // needs to think about.
  if (DOM.btnChangeDisplayName) {
    DOM.btnChangeDisplayName.addEventListener('click', async () => {
      const activeId = state.myCustomerId;
      if (!activeId) return;
      const customer = await db.getCustomer(activeId);
      if (DOM.setDisplayNameInput) DOM.setDisplayNameInput.value = (customer && customer.name) || '';
      if (DOM.setDisplayNameError) DOM.setDisplayNameError.textContent = '';
      openModal(DOM.modalSetDisplayName);
    });
  }

  // QR Code Button
  if (DOM.btnShowQr) {
    const handleQrClick = async (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }

      const activeId = state.selectedCustomerId || state.myCustomerId;
      if (!activeId) {
        showToast('Please create or log into a card first', 'error');
        return;
      }

      let customer = null;
      try {
        customer = await db.getCustomer(activeId);
        if (!customer) customer = await cloud.pullCustomer(activeId);
      } catch (err) {
        console.warn("Could not query databases for QR, trying local session fallback:", err);
      }

      if (!customer) {
        const savedSession = localStorage.getItem('86_user_session');
        if (savedSession) {
          try {
            const parsed = JSON.parse(savedSession);
            if (parsed && parsed.id === activeId) {
              customer = { id: parsed.id, name: parsed.name, phone: parsed.phone || '', avatar: parsed.avatar || 'person' };
            }
          } catch(err) {}
        }
      }

      // Final fail-safe offline object construction using basic metadata
      if (!customer) {
        customer = {
          id: activeId,
          name: localStorage.getItem(`86_user_name_${activeId}`) || 'Customer',
          phone: '',
          stamps: 0,
          rewardsEarned: 0,
          avatar: localStorage.getItem(`86_user_avatar_${activeId}`) || 'person'
        };
      }

      const ts = Date.now();
      const sig = computeIntegrityHash(customer);
      // Truncate before encoding — the QR lib's capacity math (auto-picks
      // a QR version from an estimated byte length) has edge cases with
      // multi-byte UTF-8 text like Cyrillic names where the estimate
      // undershoots the real encoded size and throws "code length
      // overflow" well before any sane string length. Staff only need
      // enough of the name/phone to recognize the customer when
      // onboarding a scan — the id is what actually matters.
      const safeName = (customer.name || '').slice(0, 24);
      const safePhone = (customer.phone || '').slice(0, 24);
      const buildPayload = (withDetails) => JSON.stringify(
        withDetails
          ? { v: 2, id: customer.id, name: safeName, phone: safePhone, ts, sig }
          : { v: 2, id: customer.id, ts, sig }
      );

      const renderQr = (text) => {
        DOM.qrcodeDisplay.innerHTML = '';
        new QRCode(DOM.qrcodeDisplay, {
          text,
          width: 200,
          height: 200,
          colorDark: "#000000",
          colorLight: "#ffffff",
          correctLevel: QRCode.CorrectLevel.H
        });
      };

      try {
        renderQr(buildPayload(true));
        openModal(DOM.modalShowQr);
      } catch (err) {
        console.warn("QR Code with name/phone overflowed, retrying with a minimal payload:", err);
        try {
          renderQr(buildPayload(false));
          openModal(DOM.modalShowQr);
        } catch (err2) {
          console.error("QR Code display error:", err2);
          showToast('Failed to generate QR code', 'error');
        }
      }
    };

    DOM.btnShowQr.addEventListener('click', handleQrClick);
  }

  if (DOM.btnCloseShowQr) DOM.btnCloseShowQr.addEventListener('click', () => closeModal(DOM.modalShowQr));

  // Flippable card — tap anywhere on either face to flip (the small
  // icon buttons are just an affordance hint, clicks on them bubble up
  // to this same handler rather than getting their own listener, so a
  // tap never fires the toggle twice).
  if (DOM.cardFlipInner) {
    DOM.cardFlipInner.addEventListener('click', () => {
      // A real tap means the customer found the flip themselves — don't
      // let the queued intro-reveal timers fight that later by flipping
      // it again out from under them.
      clearTimeout(cardIntroFlipTimer);
      clearTimeout(cardIntroFlipBackTimer);
      hapticPulse(15);
      setCardFlipped(!DOM.cardFlipInner.classList.contains('flipped'));
    });
  }
  window.addEventListener('resize', () => syncCardFlipHeight());

  // ToS & Privacy Policy Modals
  if (DOM.linkTos) DOM.linkTos.addEventListener('click', (e) => { e.preventDefault(); openModal(DOM.modalTos); });
  if (DOM.linkPrivacy) DOM.linkPrivacy.addEventListener('click', (e) => { e.preventDefault(); openModal(DOM.modalPrivacy); });
  if (DOM.btnTosSettings) DOM.btnTosSettings.addEventListener('click', () => openModal(DOM.modalTos));
  if (DOM.btnPrivacySettings) DOM.btnPrivacySettings.addEventListener('click', () => openModal(DOM.modalPrivacy));
  if (DOM.btnCloseTos) DOM.btnCloseTos.addEventListener('click', () => closeModal(DOM.modalTos));
  if (DOM.btnClosePrivacy) DOM.btnClosePrivacy.addEventListener('click', () => closeModal(DOM.modalPrivacy));
  if (DOM.overlayTos) DOM.overlayTos.addEventListener('click', () => closeModal(DOM.modalTos));
  if (DOM.overlayPrivacy) DOM.overlayPrivacy.addEventListener('click', () => closeModal(DOM.modalPrivacy));

  // Activity Filter Chips
  if (DOM.activityFilterChips) {
    DOM.activityFilterChips.forEach(chip => {
      chip.addEventListener('click', () => {
        DOM.activityFilterChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        state.activityFilter = chip.dataset.filter || 'all';
        renderActivityList(DOM.activitySearch ? DOM.activitySearch.value : '');
      });
    });
  }

  // Customer Sort Chips (Recent / Regulars)
  if (DOM.customerSortChips) {
    DOM.customerSortChips.forEach(chip => {
      chip.addEventListener('click', () => {
        DOM.customerSortChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        state.customerSort = chip.dataset.sort || 'recent';
        renderCustomersList(DOM.customerSearch ? DOM.customerSearch.value : '');
      });
    });
  }

  // Leaderboard Period Chips (All Time / This Month)
  if (DOM.leaderboardPeriodChips) {
    DOM.leaderboardPeriodChips.forEach(chip => {
      chip.addEventListener('click', () => {
        if (chip.classList.contains('active')) return;
        DOM.leaderboardPeriodChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        state.leaderboardPeriod = chip.dataset.period || 'all';
        renderLeaderboard();
      });
    });
  }

  // Menu Price View Chips (Regular / Student)
  if (DOM.menuPriceViewChips) {
    DOM.menuPriceViewChips.forEach(chip => {
      chip.addEventListener('click', () => {
        if (chip.classList.contains('active')) return;
        setMenuPriceView(chip.dataset.priceView || 'regular');
      });
    });
  }


  // Secret 5-tap gesture on Settings title
  let tapCount = 0;
  let tapTimer = null;
  const triggerSecretAdmin = async () => {
    tapCount++;
    clearTimeout(tapTimer);
    tapTimer = setTimeout(() => { tapCount = 0; }, 1500);
    if (tapCount >= 5) {
      tapCount = 0;
      if (state.staffToken) {
        toggleAdminMode(true);
        DOM.nav.classList.remove('hidden');
        switchView('view-customers');
        renderStaffProfile();
        try {
          const cloudCustomers = await cloud.pullAllCustomers(state.staffToken);
          if (cloudCustomers.length > 0) {
            for (const c of cloudCustomers) await db.saveCustomer(c);
            state.customers = await db.getAllCustomers();
            renderCustomersList();
            renderActivityList();
          }
        } catch (e) {}
      } else {
        // Whitelisted staff who are already signed in on this device with
        // their personal Google account skip the email/password form.
        const googleResult = await cloud.staffLoginGoogle();
        if (googleResult) {
          await finishStaffLogin(googleResult);
        } else {
          switchView('view-admin-login');
          showToast('Entering Staff Portal...', 'info');
        }
      }
    }
  };
  if (DOM.settingsTitle) DOM.settingsTitle.addEventListener('click', triggerSecretAdmin);
  if (DOM.appVersionText) DOM.appVersionText.addEventListener('click', triggerSecretAdmin);

  // Staff Login (named accounts replace the old shared PIN — every stamp/
  // redeem/void/edit action can now be attributed to whoever's logged in).
  if (DOM.btnStaffLoginCancel) {
    DOM.btnStaffLoginCancel.addEventListener('click', () => {
      switchView(state.myCustomerId ? 'view-home' : 'view-signup');
    });
  }
  if (DOM.btnStaffLoginSubmit) {
    DOM.btnStaffLoginSubmit.addEventListener('click', async () => {
      if (Date.now() < state.pinLockoutUntil) {
        const secs = Math.ceil((state.pinLockoutUntil - Date.now()) / 1000);
        DOM.staffLoginError.textContent = `Too many attempts. Retry in ${secs}s`;
        return;
      }
      const email = (DOM.staffLoginEmail ? DOM.staffLoginEmail.value : '').trim();
      const password = DOM.staffLoginPassword ? DOM.staffLoginPassword.value : '';
      if (!email || !password) {
        DOM.staffLoginError.textContent = 'Enter your email and password';
        return;
      }

      DOM.btnStaffLoginSubmit.disabled = true;
      const result = await cloud.staffLogin(email, password);
      DOM.btnStaffLoginSubmit.disabled = false;

      if (result.error === 'offline') {
        DOM.staffLoginError.textContent = 'Could not reach the server. Check your connection.';
        return;
      }
      if (result.error) {
        state.pinFailedAttempts++;
        if (state.pinFailedAttempts >= 5) {
          state.pinLockoutUntil = Date.now() + 30000;
          DOM.staffLoginError.textContent = 'Too many failed attempts. Locked for 30s';
        } else {
          DOM.staffLoginError.textContent = 'Incorrect email or password';
        }
        return;
      }

      state.pinFailedAttempts = 0;
      DOM.staffLoginEmail.value = '';
      DOM.staffLoginPassword.value = '';
      await finishStaffLogin(result);
    });
  }

  // Close Modals on Overlay Click
  DOM.overlayShowQr.addEventListener('click', () => closeModal(DOM.modalShowQr));
  if (DOM.overlayEditCustomer) DOM.overlayEditCustomer.addEventListener('click', () => closeModal(DOM.modalEditCustomer));

  // Auth Tabs (New Card vs Find Card)
  if (DOM.tabNewCard && DOM.tabFindCard) {
    DOM.tabNewCard.addEventListener('click', (e) => {
      e.preventDefault();
      DOM.tabNewCard.classList.add('active');
      DOM.tabFindCard.classList.remove('active');
      DOM.formNewCard.classList.remove('hidden');
      DOM.formFindCard.classList.add('hidden');
      if (DOM.signupTitleText) DOM.signupTitleText.textContent = t('signupTitle');
      if (DOM.signupSubtitleText) DOM.signupSubtitleText.textContent = t('signupSubtitleNew');
    });

    DOM.tabFindCard.addEventListener('click', (e) => {
      e.preventDefault();
      DOM.tabFindCard.classList.add('active');
      DOM.tabNewCard.classList.remove('active');
      DOM.formFindCard.classList.remove('hidden');
      DOM.formNewCard.classList.add('hidden');
      if (DOM.signupTitleText) DOM.signupTitleText.textContent = t('tabFindCard');
      if (DOM.signupSubtitleText) DOM.signupSubtitleText.textContent = t('signupSubtitleFind');
    });
  }

  // Continue with Google — works for both new and returning customers;
  // the server-side RPC finds-or-creates the matching card.
  if (DOM.btnCustomerGoogleLogin) {
    DOM.btnCustomerGoogleLogin.addEventListener('click', async () => {
      DOM.btnCustomerGoogleLogin.disabled = true;
      const result = await cloud.startGoogleLogin();
      if (result.error) {
        showToast(t('errServerConnection'), 'error');
        DOM.btnCustomerGoogleLogin.disabled = false;
      }
      // On success the browser is navigating away to Google, so there's
      // nothing left to do here — the redirect back is handled at init.
    });
  }

  // Sign Up: Create New Card with Username & Password.
  // If the username already exists and the password matches, this signs the
  // returning customer back into their existing card instead of failing.
  DOM.btnSignupSubmit.addEventListener('click', async (e) => {
    e.preventDefault();
    const username = (DOM.signupUsername ? DOM.signupUsername.value : '').trim().toLowerCase();
    const password = (DOM.signupPassword ? DOM.signupPassword.value : '');
    const passwordConfirm = (DOM.signupPasswordConfirm ? DOM.signupPasswordConfirm.value : '');
    const tosCheck = DOM.signupTosCheck ? DOM.signupTosCheck.checked : true;

    if (!username) {
      showToast(t('errChooseUsername'), 'error');
      return;
    }
    if (!isPasswordStrong(password)) {
      showToast(t('errPasswordWeak'), 'error');
      return;
    }
    if (password !== passwordConfirm) {
      showToast(t('errPasswordMismatch'), 'error');
      return;
    }
    if (!tosCheck) {
      showToast(t('errAcceptTos'), 'error');
      return;
    }

    DOM.btnSignupSubmit.disabled = true;
    try {
      // No display name field on this form — a brand new account gets a
      // placeholder name (defaults to the username server-side) and is
      // immediately prompted for a real one right after, on the home
      // screen. A returning customer signing back in via this same form
      // keeps their existing name untouched.
      const result = await cloud.signupCustomer(username, password, '');

      if (result.error === 'username_taken') {
        showToast(t('errUsernameTaken'), 'error');
        return;
      }
      if (result.error === 'weak_password') {
        showToast(t('errPasswordWeak'), 'error');
        return;
      }
      if (result.error === 'invalid_input') {
        showToast(t('errInvalidSignupInput'), 'error');
        return;
      }
      if (result.error) {
        showToast(t('errServerConnection'), 'error');
        return;
      }

      await db.saveCustomer(result.customer);
      saveUserSession(result.customer, result.token);
      await updateCardUI();
      DOM.nav.classList.remove('hidden');
      toggleAdminMode(false);
      switchView('view-home');
      showToast(result.isNew ? t('toastWelcomeNew') : t('toastWelcomeBack', { name: result.customer.name }), 'success');

      if (result.isNew) promptMandatoryDisplayName();
    } catch (err) {
      console.error('Sign up error:', err);
      showToast(t('errSignupGeneric'), 'error');
    } finally {
      DOM.btnSignupSubmit.disabled = false;
    }
  });

  // Login: Find Existing Card by Username + Password
  DOM.btnLoginSubmit.addEventListener('click', async (e) => {
    e.preventDefault();
    const username = (DOM.loginUsername ? DOM.loginUsername.value : '').trim().toLowerCase();
    const password = (DOM.loginPassword ? DOM.loginPassword.value : '');
    if (!username || !password) {
      showToast(t('errEnterUsernamePassword'), 'error');
      return;
    }

    DOM.btnLoginSubmit.disabled = true;
    try {
      const loginResult = await cloud.loginCustomer(username, password);
      if (!loginResult) {
        showToast(t('errIncorrectLogin'), 'error');
        return;
      }
      const { customer, token } = loginResult;

      await db.saveCustomer(customer);
      state.customers = await db.getAllCustomers();
      saveUserSession(customer, token);
      await updateCardUI();
      DOM.nav.classList.remove('hidden');
      toggleAdminMode(false);
      switchView('view-home');
      showToast(t('toastWelcomeBack', { name: customer.name }), 'success');
    } catch (err) {
      console.error('Login error:', err);
      showToast(t('errServerConnection'), 'error');
    } finally {
      DOM.btnLoginSubmit.disabled = false;
    }
  });

  // Logout / Switch Account — a full logout of this device, not just the
  // customer identity. A leftover staff session sitting in localStorage
  // would otherwise let the app boot straight back into admin mode with
  // no auth on the next reload (the original bug: logging out of a
  // customer account left a valid staff token behind).
  const handleUserLogout = (toastMessage = t('toastLoggedOut'), toastType = 'success') => {
    cloud.unsubscribe();
    // Also end the Google session, if there was one — otherwise the next
    // "Continue with Google" tap on this device (e.g. a shared phone)
    // would silently sign back in as whoever just logged out.
    if (supabaseClient) supabaseClient.auth.signOut().catch(() => {});
    localStorage.removeItem('86_user_session');
    state.myCustomerId = null;
    state.myToken = null;
    state.selectedCustomerId = null;

    if (state.staffToken) cloud.staffLogout(state.staffToken);
    state.staffToken = null;
    state.staffName = null;
    localStorage.removeItem('86_staff_session');
    toggleAdminMode(false);

    DOM.nav.classList.add('hidden');
    switchView('view-signup');
    showToast(toastMessage, toastType);
  };

  if (DOM.btnLogoutHeader) DOM.btnLogoutHeader.addEventListener('click', () => handleUserLogout());
  if (DOM.btnLogoutUser) DOM.btnLogoutUser.addEventListener('click', () => handleUserLogout());
  if (DOM.btnStaffLogout) DOM.btnStaffLogout.addEventListener('click', () => handleUserLogout());

  // Staff Profile: avatar (reuses the same picker modal as the customer
  // "Choose Avatar" flow, but flagged so the click handler inside it saves
  // to this staff member's own row instead of a customer's).
  if (DOM.btnStaffAvatar) {
    DOM.btnStaffAvatar.addEventListener('click', () => {
      if (!state.staffToken) return;
      state.editingStaffAvatar = true;
      openModal(DOM.modalAvatarPicker);
    });
  }

  // Staff Edit & Delete Customer Handlers
  if (DOM.btnSaveEditCustomer) {
    DOM.btnSaveEditCustomer.addEventListener('click', async () => {
      if (!state.editingCustomerId || !state.staffToken) return;
      const name = DOM.editCustomerName.value.trim();
      const phone = DOM.editCustomerPhone.value.trim();
      const newPassword = DOM.editCustomerNewPassword ? DOM.editCustomerNewPassword.value : '';

      if (DOM.editCustomerPasswordError) DOM.editCustomerPasswordError.textContent = '';
      if (newPassword && !isPasswordStrong(newPassword)) {
        if (DOM.editCustomerPasswordError) DOM.editCustomerPasswordError.textContent = t('errPasswordWeak');
        return;
      }

      const updated = await cloud.staffEditCustomer(state.staffToken, state.editingCustomerId, name, phone);
      if (!updated) {
        showToast('Could not save — that username may already be taken', 'error');
        return;
      }

      if (newPassword) {
        const resetResult = await cloud.staffResetCustomerPassword(state.staffToken, state.editingCustomerId, newPassword);
        if (resetResult.error) {
          await db.saveCustomer(updated);
          state.customers = await db.getAllCustomers();
          if (DOM.editCustomerPasswordError) DOM.editCustomerPasswordError.textContent = t('errServerConnection');
          showToast('Name/username saved, but password reset failed — try again', 'error');
          return;
        }
      }

      await db.saveCustomer(updated);
      state.customers = await db.getAllCustomers();

      closeModal(DOM.modalEditCustomer);
      renderCustomersList(DOM.customerSearch.value);
      renderActivityList();
      if (state.selectedCustomerId === updated.id) await updateCardUI();
      showToast(newPassword ? 'Customer updated & password reset' : 'Customer updated', 'success');
    });
  }

  if (DOM.btnDeleteCustomer) {
    DOM.btnDeleteCustomer.addEventListener('click', async () => {
      if (!state.editingCustomerId || !state.staffToken) return;
      const id = state.editingCustomerId;

      const ok = await cloud.staffDeleteCustomer(state.staffToken, id);
      if (!ok) {
        showToast('Could not delete — check your connection', 'error');
        return;
      }
      await db.deleteCustomer(id);
      state.customers = await db.getAllCustomers();

      if (state.selectedCustomerId === id) state.selectedCustomerId = null;
      if (state.myCustomerId === id) state.myCustomerId = null;

      closeModal(DOM.modalEditCustomer);
      renderCustomersList(DOM.customerSearch.value);
      renderActivityList();
      showToast('Customer card deleted', 'success');
    });
  }

  // Search Customers
  DOM.customerSearch.addEventListener('input', (e) => {
    renderCustomersList(e.target.value);
  });

  // Search Activity Log
  if (DOM.activitySearch) {
    DOM.activitySearch.addEventListener('input', (e) => {
      renderActivityList(e.target.value);
    });
  }

  // Add Stamp Action (Admin) - Open Drink Selector Modal
  DOM.btnAddStamp.addEventListener('click', () => {
    if (!state.selectedCustomerId || !state.isAdmin) return;
    openModal(DOM.modalDrinkPicker);
  });

  if (DOM.btnCancelDrinkPicker) {
    DOM.btnCancelDrinkPicker.addEventListener('click', () => closeModal(DOM.modalDrinkPicker));
  }
  if (DOM.overlayDrinkPicker) {
    DOM.overlayDrinkPicker.addEventListener('click', () => closeModal(DOM.modalDrinkPicker));
  }

  // Handle Drink Option Stamping (+1, +2 for Matcha / Freddo Espresso, +3 for Specialty)
  // Stamp math (overflow into rewards, campaign multiplier, lifetime
  // total, staff attribution) all happens server-side now so it can't
  // drift between devices or be tampered with client-side.
  DOM.drinkOptionBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!state.selectedCustomerId || !state.isAdmin || !state.staffToken) return;

      const oldCustomer = await db.getCustomer(state.selectedCustomerId);
      const oldStamps = oldCustomer ? (oldCustomer.stamps || 0) : 0;
      const baseStamps = parseInt(btn.dataset.stamps, 10) || 1;
      const drinkName = btn.dataset.drink || 'Drink';

      closeModal(DOM.modalDrinkPicker);

      const result = await cloud.staffAddStamp(state.staffToken, state.selectedCustomerId, baseStamps, drinkName);
      if (result.error) {
        if (result.error === 'session_expired') {
          showToast('Your staff session expired — please log in again', 'error');
          state.staffToken = null;
          state.staffName = null;
          localStorage.removeItem('86_staff_session');
          toggleAdminMode(false);
          switchView('view-admin-login');
        } else if (result.error === 'customer_missing') {
          showToast('This customer never made it to the server — scan their card again to re-sync', 'error');
        } else {
          showToast('Could not add stamp — check your connection', 'error');
        }
        return;
      }
      const updated = result.customer;

      await db.saveCustomer(updated);
      state.customers = await db.getAllCustomers();

      const bankedNew = updated.rewardsEarned > (oldCustomer ? (oldCustomer.rewardsEarned || 0) : 0);
      await updateCardUI();
      if (bankedNew) {
        playRewardSound();
        hapticPulse([30, 40, 30, 40, 60]);
        showToast(`${drinkName}! Reward Banked for Customer! (${updated.rewardsEarned} Available)`, 'success');
        // Fire-and-forget — never let a slow/failed push delay the stamp
        // UI feedback above, which has already happened by this point.
        cloud.sendPush({
          staffToken: state.staffToken,
          customerId: updated.id,
          title: '🎉 Free coffee unlocked!',
          body: `${updated.name}, your card is full — come redeem your free drink.`,
          url: './index.html#signup'
        });
      } else {
        playStampSound();
        hapticPulse(25);
        bumpStampCount();
        for (let i = oldStamps; i < updated.stamps; i++) {
          const cup = document.getElementById(`stamp-${i}`);
          if (cup) {
            // Stagger multi-stamp gains (double-dose items) so each cup
            // pops in sequence instead of all at once.
            cup.style.animationDelay = ((i - oldStamps) * 90) + 'ms';
            cup.classList.add('earning');
            setTimeout(() => { cup.classList.remove('earning'); cup.style.animationDelay = ''; }, 600 + (i - oldStamps) * 90);
          }
        }
        const gained = updated.totalStampsEarned - (oldCustomer ? (oldCustomer.totalStampsEarned || 0) : 0);
        showToast(gained > 1 ? `${drinkName}! +${gained} Stamps Added!` : 'Stamp added!', 'success');
      }
      renderCustomersList(DOM.customerSearch.value);
      renderActivityList();
    });
  });

  // Remove Stamp (mistaken tap, wrong customer, etc.)
  if (DOM.btnRemoveStamp) {
    DOM.btnRemoveStamp.addEventListener('click', async () => {
      if (!state.selectedCustomerId || !state.isAdmin || !state.staffToken) return;
      const result = await cloud.staffRemoveStamp(state.staffToken, state.selectedCustomerId);
      if (result.error === 'no_stamps') {
        showToast('No stamps to remove', 'error');
        return;
      }
      if (result.error) {
        showToast('Could not remove stamp — check your connection', 'error');
        return;
      }
      await db.saveCustomer(result.customer);
      state.customers = await db.getAllCustomers();
      await updateCardUI();
      renderCustomersList(DOM.customerSearch.value);
      renderActivityList();
      showToast('Stamp removed', 'info');
    });
  }

  // Void the customer's most recent redemption (accidental tap, redeemed
  // twice, etc). Only reaches back to the single most recent one, on
  // purpose — this isn't a general history editor.
  if (DOM.btnVoidRedemption) {
    DOM.btnVoidRedemption.addEventListener('click', async () => {
      if (!state.selectedCustomerId || !state.isAdmin || !state.staffToken) return;
      const result = await cloud.staffVoidLastRedemption(state.staffToken, state.selectedCustomerId);
      if (result.error === 'no_redemption') {
        showToast(t('voidNoRedemption'), 'error');
        return;
      }
      if (result.error) {
        showToast(t('voidErrorConnection'), 'error');
        return;
      }
      await db.saveCustomer(result.customer);
      state.customers = await db.getAllCustomers();
      await updateCardUI();
      renderCustomersList(DOM.customerSearch.value);
      renderActivityList();
      showToast(t('voidSuccess'), 'success');
    });
  }

  // Mark/unmark a customer as a verified student — a one-time flag so
  // staff only ever need to check this app's QR going forward, not a
  // second one for student proof.
  if (DOM.btnToggleStudent) {
    DOM.btnToggleStudent.addEventListener('click', async () => {
      if (!state.selectedCustomerId || !state.isAdmin || !state.staffToken) return;
      const current = await db.getCustomer(state.selectedCustomerId);
      const nextValue = !(current && current.isStudent);
      const updated = await cloud.staffSetStudentStatus(state.staffToken, state.selectedCustomerId, nextValue);
      if (!updated) {
        showToast(t('studentStatusError'), 'error');
        return;
      }
      await db.saveCustomer(updated);
      state.customers = await db.getAllCustomers();
      await updateCardUI();
      renderCustomersList(DOM.customerSearch.value);
      showToast(nextValue ? t('studentStatusOn') : t('studentStatusOff'), 'success');
    });
  }

  // Action: Keep in Wallet & Reset Card — the server re-checks stamps
  // itself, so this can no longer be forged by mutating a local object.
  DOM.btnCloseReward.addEventListener('click', async () => {
    if (state.selectedCustomerId) {
      const isSelf = !state.isAdmin && state.selectedCustomerId === state.myCustomerId;
      const result = isSelf
        ? await cloud.bankReward(state.myToken)
        : await cloud.staffBankReward(state.staffToken, state.selectedCustomerId);
      if (result.error) {
        showToast(t('errServerConnection'), 'error');
        closeModal(DOM.rewardOverlay);
        return;
      }
      await db.saveCustomer(result.customer);
      state.customers = await db.getAllCustomers();
      await updateCardUI();
      showToast('Reward saved to Wallet! Stamp card reset.', 'success');
    }
    closeModal(DOM.rewardOverlay);
  });

  // Tier milestone celebration — purely informational, the bonus stamps
  // already landed server-side, so this is just a dismiss.
  if (DOM.btnCloseMilestone) {
    DOM.btnCloseMilestone.addEventListener('click', () => closeModal(DOM.milestoneOverlay));
  }

  // Action: Redeem Reward (Counter / Wallet / Staff Mode) — server
  // verifies rewards_earned/stamps and expiry, decrements atomically,
  // and attributes staff-performed redemptions in the history entry.
  const handleRedeem = async () => {
    if (!state.selectedCustomerId) return;

    const customer = await db.getCustomer(state.selectedCustomerId);
    if (!customer) return;

    if (isRewardExpired(customer)) {
      showToast('This reward expired 1 year after it was earned', 'error');
      closeModal(DOM.rewardOverlay);
      return;
    }

    const method = customer.rewardsEarned > 0 ? 'wallet' : (customer.stamps >= MAX_STAMPS ? 'direct' : null);
    if (!method) return;

    const isSelf = !state.isAdmin && state.selectedCustomerId === state.myCustomerId;
    const result = isSelf
      ? await cloud.redeemReward(state.myToken, method)
      : await cloud.staffRedeemReward(state.staffToken, state.selectedCustomerId, method);

    if (result.error) {
      showToast(result.error === 'reward_expired' ? 'This reward expired 1 year after it was earned' : t('errServerConnection'), 'error');
      closeModal(DOM.rewardOverlay);
      return;
    }

    await db.saveCustomer(result.customer);
    state.customers = await db.getAllCustomers();

    closeModal(DOM.rewardOverlay);
    await updateCardUI();
    playRewardSound();
    hapticPulse([30, 40, 30, 40, 60]);
    showToast('Reward redeemed! Enjoy your free coffee!', 'success');
    renderCustomersList(DOM.customerSearch.value);
    renderActivityList();
  };

  DOM.btnRedeemReward.addEventListener('click', handleRedeem);

  // Banked-reward redemption is a single tap with no other confirmation
  // step, so it gets a confirm dialog first (unlike the reward-overlay's
  // Redeem button, which already sits behind a deliberate two-choice screen).
  if (DOM.modalConfirmRedeem) {
    const openRedeemConfirm = () => openModal(DOM.modalConfirmRedeem);
    if (DOM.btnRedeemBanked) DOM.btnRedeemBanked.addEventListener('click', openRedeemConfirm);
    if (DOM.btnAdminRedeem) DOM.btnAdminRedeem.addEventListener('click', openRedeemConfirm);

    DOM.btnConfirmRedeem.addEventListener('click', () => {
      closeModal(DOM.modalConfirmRedeem);
      handleRedeem();
    });
    DOM.btnCancelRedeem.addEventListener('click', () => closeModal(DOM.modalConfirmRedeem));
    DOM.overlayConfirmRedeem.addEventListener('click', () => closeModal(DOM.modalConfirmRedeem));
  } else {
    if (DOM.btnRedeemBanked) DOM.btnRedeemBanked.addEventListener('click', handleRedeem);
    if (DOM.btnAdminRedeem) DOM.btnAdminRedeem.addEventListener('click', handleRedeem);
  }

  // Right after a brand-new signup, this same modal reopens in mandatory
  // mode (no skip route) so a customer never ends up permanently stuck
  // with the auto-generated placeholder name — see promptMandatoryDisplayName().
  if (DOM.btnSetDisplayNameSkip) {
    DOM.btnSetDisplayNameSkip.addEventListener('click', () => {
      if (state.mandatoryDisplayNamePrompt) return;
      closeModal(DOM.modalSetDisplayName);
    });
  }
  if (DOM.overlaySetDisplayName) {
    DOM.overlaySetDisplayName.addEventListener('click', () => {
      if (state.mandatoryDisplayNamePrompt) return;
      closeModal(DOM.modalSetDisplayName);
    });
  }
  if (DOM.btnSetDisplayNameSave) {
    DOM.btnSetDisplayNameSave.addEventListener('click', async () => {
      const name = (DOM.setDisplayNameInput ? DOM.setDisplayNameInput.value : '').trim();
      if (!name) {
        DOM.setDisplayNameError.textContent = t('errChooseDisplayName');
        return;
      }
      if (!state.myCustomerId) {
        closeModal(DOM.modalSetDisplayName);
        return;
      }

      DOM.btnSetDisplayNameSave.disabled = true;
      const result = await cloud.setDisplayName(state.myToken, name);
      DOM.btnSetDisplayNameSave.disabled = false;

      if (result.error === 'rate_limited') {
        const dateStr = result.nextChangeAt ? new Date(result.nextChangeAt).toLocaleDateString() : '';
        DOM.setDisplayNameError.textContent = t('errDisplayNameRateLimited', { date: dateStr });
        return;
      }
      if (result.error === 'name_taken') {
        DOM.setDisplayNameError.textContent = t('errDisplayNameTaken');
        return;
      }
      if (result.error) {
        DOM.setDisplayNameError.textContent = t('errServerConnection');
        return;
      }

      await db.saveCustomer(result.customer);
      state.customers = await db.getAllCustomers();
      const savedSession = JSON.parse(localStorage.getItem('86_user_session') || 'null');
      if (savedSession && savedSession.id === result.customer.id) {
        savedSession.name = result.customer.name;
        localStorage.setItem('86_user_session', JSON.stringify(savedSession));
      }
      if (state.mandatoryDisplayNamePrompt) {
        state.mandatoryDisplayNamePrompt = false;
        if (DOM.btnSetDisplayNameSkip) DOM.btnSetDisplayNameSkip.classList.remove('hidden');
      }
      closeModal(DOM.modalSetDisplayName);
      await updateCardUI();
      showToast(t('toastDisplayNameSaved'), 'success');
    });
  }


  // Notifications Panel (Home header bell)
  if (DOM.btnOpenNotifications) {
    DOM.btnOpenNotifications.addEventListener('click', async () => {
      if (!state.myCustomerId) return;
      openModal(DOM.modalNotifications);
      await loadAndRenderNotifications();
    });
  }
  if (DOM.btnCloseNotifications) DOM.btnCloseNotifications.addEventListener('click', () => closeModal(DOM.modalNotifications));
  if (DOM.overlayNotifications) DOM.overlayNotifications.addEventListener('click', () => closeModal(DOM.modalNotifications));

  if (DOM.btnClearAllNotifications) {
    DOM.btnClearAllNotifications.addEventListener('click', async () => {
      DOM.btnClearAllNotifications.disabled = true;
      await cloud.clearAllNotifications(state.myToken);
      DOM.btnClearAllNotifications.disabled = false;
      renderNotificationsList([]);
      refreshNotifBadge();
    });
  }

  // Delete / accept / decline buttons live inside dynamically-rendered
  // rows — one delegated listener instead of re-binding on every render.
  if (DOM.notificationsList) {
    DOM.notificationsList.addEventListener('click', async (e) => {
      const deleteBtn = e.target.closest('.notif-row-delete');
      if (deleteBtn) {
        const row = deleteBtn.closest('.notif-row');
        await cloud.deleteNotification(state.myToken, deleteBtn.dataset.id);
        if (row) row.remove();
        if (DOM.notificationsList && !DOM.notificationsList.querySelector('.notif-row')) {
          renderNotificationsList([]);
        }
        return;
      }

      const acceptBtn = e.target.closest('.notif-accept-btn');
      const declineBtn = e.target.closest('.notif-decline-btn');
      const btn = acceptBtn || declineBtn;
      if (!btn || btn.disabled) return;
      btn.disabled = true;
      const ok = await cloud.respondFriendRequest(state.myToken, btn.dataset.requestId, !!acceptBtn);
      if (ok && acceptBtn) {
        hapticPulse([20, 30, 20]);
        showToast(t('toastFriendRequestAccepted', { name: btn.dataset.requestName || '' }), 'success');
      }
      const row = btn.closest('.notif-row');
      if (row) row.remove();
      if (DOM.notificationsList && !DOM.notificationsList.querySelector('.notif-row')) {
        renderNotificationsList([]);
      }
    });
  }

  // Friends & Gifting (Settings > Account > Friends, and Home quick-access)
  const openFriendsModal = async () => {
    if (!state.myCustomerId) return;
    DOM.addFriendInput.value = '';
    DOM.addFriendError.textContent = '';
    openModal(DOM.modalFriends);
    await loadAndRenderFriends();
  };
  if (DOM.btnOpenFriends) DOM.btnOpenFriends.addEventListener('click', openFriendsModal);
  if (DOM.btnOpenFriendsHome) DOM.btnOpenFriendsHome.addEventListener('click', openFriendsModal);
  if (DOM.btnCloseFriends) DOM.btnCloseFriends.addEventListener('click', () => closeModal(DOM.modalFriends));
  if (DOM.overlayFriends) DOM.overlayFriends.addEventListener('click', () => closeModal(DOM.modalFriends));

  if (DOM.btnAddFriend) {
    DOM.btnAddFriend.addEventListener('click', async () => {
      const friendName = (DOM.addFriendInput.value || '').trim();
      if (!friendName) {
        DOM.addFriendError.textContent = t('errEnterFriendName');
        return;
      }
      DOM.btnAddFriend.disabled = true;
      const result = await cloud.sendFriendRequest(state.myToken, friendName);
      DOM.btnAddFriend.disabled = false;

      if (result.error === 'not_found') {
        DOM.addFriendError.textContent = t('errFriendNotFound');
        return;
      }
      if (result.error === 'self') {
        DOM.addFriendError.textContent = t('errCannotAddSelf');
        return;
      }
      if (result.error === 'session_expired') {
        closeModal(DOM.modalFriends);
        handleUserLogout(t('errSessionExpired'), 'error');
        return;
      }
      if (result.error) {
        DOM.addFriendError.textContent = t('errServerConnection');
        return;
      }

      DOM.addFriendError.textContent = '';
      DOM.addFriendInput.value = '';

      const me = state.myCustomerId ? await db.getCustomer(state.myCustomerId) : null;
      const myName = (me && me.name) || 'Someone';

      if (result.status === 'already_friends') {
        showToast(t('errAlreadyFriends', { name: result.friend.name }), 'error');
      } else if (result.status === 'already_pending') {
        showToast(t('errAlreadyPending', { name: result.friend.name }), 'error');
      } else if (result.status === 'accepted') {
        // Auto-accept path: the other person had already requested us,
        // so THEY are the one who should hear their request just got
        // accepted, not the reverse.
        showToast(t('toastFriendAdded', { name: result.friend.name }), 'success');
        cloud.sendPush({
          customerToken: state.myToken,
          targetCustomerId: result.friend.id,
          context: 'friend_accepted',
          title: '🎉 Friend request accepted',
          body: `${myName} accepted your friend request!`,
          url: './index.html#settings'
        });
      } else {
        showToast(t('toastFriendRequestSent', { name: result.friend.name }), 'success');
        cloud.sendPush({
          customerToken: state.myToken,
          targetCustomerId: result.friend.id,
          context: 'friend_request',
          title: '👋 New friend request',
          body: `${myName} wants to add you as a friend`,
          url: './index.html#settings'
        });
      }
      await loadAndRenderFriends();
    });
  }

  // Accept/decline buttons live inside dynamically-rendered pending-request
  // rows — one delegated listener instead of re-binding on every render.
  if (DOM.friendRequestsList) {
    DOM.friendRequestsList.addEventListener('click', async (e) => {
      const acceptBtn = e.target.closest('.friend-request-accept-btn');
      const declineBtn = e.target.closest('.friend-request-decline-btn');
      const btn = acceptBtn || declineBtn;
      if (!btn || btn.disabled) return;
      btn.disabled = true;
      const ok = await cloud.respondFriendRequest(state.myToken, btn.dataset.requestId, !!acceptBtn);
      if (ok && acceptBtn) {
        hapticPulse([20, 30, 20]);
        showToast(t('toastFriendRequestAccepted', { name: btn.dataset.requestName }), 'success');
        const me = state.myCustomerId ? await db.getCustomer(state.myCustomerId) : null;
        const myName = (me && me.name) || 'Someone';
        cloud.sendPush({
          customerToken: state.myToken,
          targetCustomerId: btn.dataset.requesterId,
          context: 'friend_accepted',
          title: '🎉 Friend request accepted',
          body: `${myName} accepted your friend request!`,
          url: './index.html#settings'
        });
      }
      await loadAndRenderFriends();
    });
  }

  // Gift/remove buttons live inside dynamically-rendered rows — one
  // delegated listener on the list container instead of re-binding on
  // every render.
  if (DOM.friendsList) {
    DOM.friendsList.addEventListener('click', (e) => {
      const giftBtn = e.target.closest('.friend-row-gift-btn');
      if (giftBtn && !giftBtn.disabled) {
        openGiftConfirm(giftBtn.dataset.friendId, giftBtn.dataset.friendName);
        return;
      }
      const removeBtn = e.target.closest('.friend-row-remove-btn');
      if (removeBtn) {
        openRemoveFriendConfirm(removeBtn.dataset.friendId, removeBtn.dataset.friendName);
      }
    });
  }

  if (DOM.btnCancelRemoveFriend) DOM.btnCancelRemoveFriend.addEventListener('click', () => closeModal(DOM.modalConfirmRemoveFriend));
  if (DOM.overlayConfirmRemoveFriend) DOM.overlayConfirmRemoveFriend.addEventListener('click', () => closeModal(DOM.modalConfirmRemoveFriend));
  if (DOM.btnConfirmRemoveFriend) {
    DOM.btnConfirmRemoveFriend.addEventListener('click', async () => {
      const friendId = DOM.btnConfirmRemoveFriend.dataset.friendId;
      if (!friendId) return;
      DOM.btnConfirmRemoveFriend.disabled = true;
      await removeFriendAndRerender(friendId);
      DOM.btnConfirmRemoveFriend.disabled = false;
      closeModal(DOM.modalConfirmRemoveFriend);
    });
  }

  if (DOM.btnCancelGift) DOM.btnCancelGift.addEventListener('click', () => closeModal(DOM.modalConfirmGift));
  if (DOM.overlayConfirmGift) DOM.overlayConfirmGift.addEventListener('click', () => closeModal(DOM.modalConfirmGift));
  if (DOM.btnConfirmGift) {
    DOM.btnConfirmGift.addEventListener('click', async () => {
      const friendId = DOM.btnConfirmGift.dataset.friendId;
      if (!friendId) return;
      DOM.btnConfirmGift.disabled = true;
      const result = await cloud.giftReward(state.myToken, friendId);
      DOM.btnConfirmGift.disabled = false;
      closeModal(DOM.modalConfirmGift);

      if (result.error === 'no_reward') {
        showToast(t('errNoRewardToGift'), 'error');
        return;
      }
      if (result.error === 'not_friends') {
        showToast(t('errNotFriends'), 'error');
        await loadAndRenderFriends();
        return;
      }
      if (result.error) {
        showToast(t('errServerConnection'), 'error');
        return;
      }

      await db.saveCustomer(result.customer);
      state.customers = await db.getAllCustomers();
      await updateCardUI();
      hapticPulse([20, 30, 20]);
      showToast(t('toastGiftSent'), 'success');
    });
  }

  // Stamp Campaign Toggle (e.g. "Double Stamps This Week")
  if (DOM.campaignToggle) {
    DOM.campaignToggle.addEventListener('change', async () => {
      if (!state.staffToken) return;
      const wantActive = DOM.campaignToggle.checked;
      DOM.campaignToggle.disabled = true;
      const result = await cloud.staffSetCampaign(state.staffToken, wantActive, 2, 'Double Stamps');
      DOM.campaignToggle.disabled = false;
      if (!result) {
        DOM.campaignToggle.checked = !wantActive;
        showToast('Could not update campaign — check your connection', 'error');
        return;
      }
      state.campaign = result;
      DOM.campaignStatusText.textContent = result.active ? `Active — ${result.multiplier}x stamps` : t('campaignInactive');
      showToast(result.active ? 'Double Stamps campaign is live!' : 'Campaign turned off', 'success');

      // Only offer this on the ON transition — a mass notification is a
      // bigger deal than a normal toggle flip, so it gets its own
      // explicit confirmation rather than firing on every flip either way.
      if (result.active && window.confirm('Notify every subscribed customer that Double Stamps just went live?')) {
        cloud.sendPush({
          staffToken: state.staffToken,
          broadcast: true,
          title: `✨ ${result.label || 'Double Stamps'} is live!`,
          body: `${result.multiplier}x stamps on every order today at Eightysix°.`,
          url: './index.html#signup'
        }).then(res => {
          if (res && typeof res.sent === 'number') {
            showToast(`Notified ${res.sent} customer${res.sent === 1 ? '' : 's'}`, 'info');
          }
        });
      }
    });
  }

  // ==========================================
  // ADD TO HOME SCREEN / INSTALL ENGINE
  // ==========================================
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const isDismissed = localStorage.getItem('86_install_dismissed') === 'true';

  if (isStandalone || isDismissed) {
    if (DOM.installBanner) DOM.installBanner.classList.add('hidden');
    if (isStandalone && DOM.installSettingsLabel) {
      DOM.installSettingsLabel.textContent = "✓ Installed on Home Screen";
    }
  } else if (DOM.installBanner) {
    // Shown by default (not gated behind beforeinstallprompt, which never
    // fires on iOS Safari) — the button falls back to the manual iOS
    // "Add to Home Screen" guide when there's no native install prompt.
    DOM.installBanner.classList.remove('hidden');
  }

  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (!isStandalone && !isDismissed && DOM.installBanner) {
      DOM.installBanner.classList.remove('hidden');
    }
  });

  const triggerInstallFlow = async () => {
    if (isStandalone) {
      showToast('App is already installed on your home screen!', 'success');
      return;
    }

    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      deferredPrompt = null;
      if (DOM.installBanner) DOM.installBanner.classList.add('hidden');
      if (outcome === 'accepted') {
        showToast('Eightysix° added to home screen!', 'success');
        if (DOM.installSettingsLabel) DOM.installSettingsLabel.textContent = "✓ Installed on Home Screen";
      }
    } else {
      openModal(DOM.modalInstallGuide);
    }
  };

  if (DOM.btnInstall) DOM.btnInstall.addEventListener('click', triggerInstallFlow);
  if (DOM.btnInstallSettings) DOM.btnInstallSettings.addEventListener('click', triggerInstallFlow);
  if (DOM.btnCloseInstall) {
    DOM.btnCloseInstall.addEventListener('click', () => {
      localStorage.setItem('86_install_dismissed', 'true');
      if (DOM.installBanner) DOM.installBanner.classList.add('hidden');
    });
  }
  if (DOM.btnCloseInstallGuide) DOM.btnCloseInstallGuide.addEventListener('click', () => closeModal(DOM.modalInstallGuide));
  if (DOM.overlayInstallGuide) DOM.overlayInstallGuide.addEventListener('click', () => closeModal(DOM.modalInstallGuide));

  // ==========================================
  // SECURE SIGNED QR CODE LOGIC
  // ==========================================
  let html5QrCode = null;

  if (DOM.btnScanQr) {
    DOM.btnScanQr.addEventListener('click', async () => {
      openModal(DOM.modalScanQr);

      if (html5QrCode) {
        try { await html5QrCode.stop(); html5QrCode.clear(); } catch(e){}
        html5QrCode = null;
      }

      html5QrCode = new Html5Qrcode("qr-reader");
      const config = {
        fps: 10,
        qrbox: (width, height) => {
          const size = Math.floor(Math.min(width, height) * 0.7);
          return { width: size, height: size };
        },
        // NOTE: no fixed aspectRatio here on purpose — forcing aspectRatio (e.g. 1.0)
        // is a known cause of black-screen / camera-start failures on iOS Safari
        // (iPhone 15/16/17), since some rear lenses can't satisfy a forced square stream.
        formatsToSupport: window.Html5QrcodeSupportedFormats ? [ window.Html5QrcodeSupportedFormats.QR_CODE ] : []
      };

      const onScanSuccess = async (decodedText) => {
        let custId = null;
        let custName = null;
        let custPhone = null;

        try {
          const data = JSON.parse(decodedText);
          if (data && data.v === 2 && data.id) {
            custId = data.id;
            custName = data.name;
            custPhone = data.phone;
          }
        } catch (e) {
          if (decodedText.startsWith("86_v2|")) {
            const parts = decodedText.split('|');
            custId = parts[1];
            custName = parts[2];
            custPhone = parts[3];
          }
        }

        if (custId) {
          await stopQrScanner();

          let customer = await cloud.pullCustomer(custId);
          if (!customer) customer = await db.getCustomer(custId);

          if (!customer) {
            let created = await cloud.staffCreateCustomer(state.staffToken, custId, custName || 'Customer', custPhone || '');
            if (!created) {
              // One retry — most failures here are a transient blip, not a
              // real outage, and it's worth the extra second to avoid
              // leaving a local-only record that later stamp actions can't
              // find server-side.
              created = await cloud.staffCreateCustomer(state.staffToken, custId, custName || 'Customer', custPhone || '');
            }
            customer = created || await db.addCustomer(custName || 'Customer', custPhone || '', custId);
            await db.saveCustomer(customer);
            state.customers = await db.getAllCustomers();
            showToast(created ? 'New customer synced!' : 'Saved locally — will sync when adding a stamp', created ? 'success' : 'info');
          } else {
            await db.saveCustomer(customer);
            state.customers = await db.getAllCustomers();
            showToast('Customer found!', 'success');
          }

          state.selectedCustomerId = custId;
          updateCardUI();
          renderCustomersList(DOM.customerSearch.value);
          renderActivityList();
          switchView('view-home');
        } else {
          showToast('Invalid QR Code format.', 'error');
        }
      };

      // Some iPhones (notably iPhone 15/16/17 with multi-lens rear cameras) reject or
      // silently fail a plain facingMode request. If that happens, fall back to
      // explicitly enumerating cameras and picking the rear one by id instead.
      try {
        await html5QrCode.start({ facingMode: "environment" }, config, onScanSuccess, () => {});
      } catch (err1) {
        console.warn("facingMode camera start failed, falling back to device enumeration:", err1);
        try {
          const cameras = await Html5Qrcode.getCameras();
          if (!cameras || !cameras.length) throw err1;
          const backCamera = cameras.find(c => /back|rear|environment/i.test(c.label)) || cameras[cameras.length - 1];
          await html5QrCode.start(backCamera.id, config, onScanSuccess, () => {});
        } catch (err2) {
          console.error("Camera start failed:", err2);
          const isPermissionError = err2 && (err2.name === 'NotAllowedError' || /permission/i.test(String(err2)));
          showToast(isPermissionError ? 'Camera permission denied. Enable camera access in Settings.' : 'Could not start camera on this device.', 'error');
          closeModal(DOM.modalScanQr);
        }
      }
    });
  }

  if (DOM.btnCancelScanQr) DOM.btnCancelScanQr.addEventListener('click', () => stopQrScanner());
  if (DOM.overlayScanQr) DOM.overlayScanQr.addEventListener('click', () => stopQrScanner());

  async function stopQrScanner() {
    if (html5QrCode) {
      try {
        await html5QrCode.stop();
        html5QrCode.clear();
      } catch (err) {
        console.log("Scanner stopped", err);
      }
      html5QrCode = null;
    }
    closeModal(DOM.modalScanQr);
  }

  setupScrollDiagnostic();
}

// TEMPORARY — long-press the greeting text on the Card tab (~1.2s) for
// live layout/scroll metrics. Browser-automated testing (real device
// emulation, simulated safe-area-inset values) already confirmed the
// CSS math itself is correct — real overflow exists and the QR/Friends
// buttons clear the bottom nav with the intended gap — so what's left
// to rule out is specific to actual iOS hardware: is this build even
// the one running (a PWA that's merely backgrounded, not truly force-
// quit, can keep running old code indefinitely), and does a real touch
// gesture actually produce a scroll on-device the way a mouse/programmatic
// one does in every other test environment.
function setupScrollDiagnostic() {
  const view = DOM.viewHome;
  if (!view || !DOM.homeGreeting) return;
  // .home-scroll, not view-home itself, is the element that actually
  // scrolls now — see getScrollableEl().
  const scrollEl = getScrollableEl(view);
  let touchCount = 0, moveCount = 0, scrollCount = 0;
  scrollEl.addEventListener('touchstart', () => { touchCount++; }, { passive: true });
  scrollEl.addEventListener('touchmove', () => { moveCount++; }, { passive: true });
  scrollEl.addEventListener('scroll', () => { scrollCount++; }, { passive: true });

  let pressTimer = null;
  const showDiagnostic = () => {
    const qr = document.getElementById('btn-show-qr');
    const nav = document.getElementById('bottom-nav');
    const qrRect = qr ? qr.getBoundingClientRect() : null;
    const navRect = nav ? nav.getBoundingClientRect() : null;
    alert(
      'BUILD: ' + APP_BUILD_ID + '\n\n' +
      'scrollHeight: ' + scrollEl.scrollHeight + '\n' +
      'clientHeight: ' + scrollEl.clientHeight + '\n' +
      'overflow: ' + (scrollEl.scrollHeight - scrollEl.clientHeight) + 'px\n' +
      'scrollTop: ' + scrollEl.scrollTop + '\n' +
      'touchstart events: ' + touchCount + '\n' +
      'touchmove events: ' + moveCount + '\n' +
      'scroll events: ' + scrollCount + '\n' +
      (qrRect ? 'QR button bottom: ' + qrRect.bottom.toFixed(0) + '\n' : '') +
      (navRect ? 'nav top: ' + navRect.top.toFixed(0) + '\n' : '') +
      (qrRect && navRect ? 'QR-to-nav gap: ' + (navRect.top - qrRect.bottom).toFixed(0) + 'px\n' : '') +
      'sat/sab: ' + getComputedStyle(document.documentElement).getPropertyValue('--sat') + ' / ' + getComputedStyle(document.documentElement).getPropertyValue('--sab') + '\n' +
      'standalone: ' + (window.navigator.standalone === true) + '\n' +
      'sw controller: ' + (navigator.serviceWorker && navigator.serviceWorker.controller ? 'yes' : 'no')
    );
  };
  DOM.homeGreeting.addEventListener('touchstart', () => {
    pressTimer = setTimeout(showDiagnostic, 1200);
  }, { passive: true });
  DOM.homeGreeting.addEventListener('touchend', () => clearTimeout(pressTimer));
  DOM.homeGreeting.addEventListener('touchmove', () => clearTimeout(pressTimer));
}

// ==========================================
// UI UPDATES & HELPERS
// ==========================================

// Most views scroll themselves directly. view-home doesn't — its header
// is a plain sibling outside the scroll box (see .home-scroll in
// styles.css), so #view-home itself never scrolls and .home-scroll is
// the element every scroll-position fix below actually needs to touch.
function getScrollableEl(view) {
  return view.querySelector('.home-scroll') || view;
}

function switchView(viewId) {
  state.currentView = viewId;

  DOM.navItems.forEach(item => {
    if (item.dataset.target === viewId) item.classList.add('active');
    else item.classList.remove('active');
  });

  DOM.views.forEach(view => {
    if (view.id === viewId) {
      view.classList.add('active');
      // A view keeps whatever scroll position it was left at (same DOM
      // element, just re-rendered with new content) — logging out and
      // signing into a fresh account can land back on view-home with
      // far less content than before (no student promo yet, no
      // campaign banner, etc.), so the old scroll offset can end up
      // past the new, shorter scrollHeight. iOS Safari's momentum
      // scroll has a long history of getting stuck rather than
      // clamping back in that situation. Reset on every switch — also
      // just correct tab-nav behavior (each tab starts at the top).
      getScrollableEl(view).scrollTop = 0;
    } else {
      view.classList.remove('active');
    }
  });

  // The view being switched to was very likely laid out (content
  // populated, syncCardFlipHeight etc.) while it was still
  // visibility:hidden/inactive — e.g. view-home fills in via
  // updateCardUI() during app boot, well before dismissSplash() ever
  // calls switchView('view-home'). iOS Safari can fail to properly wire
  // up touch-scroll for an overflow:auto region that was never visible
  // during its own layout pass, and merely toggling visibility later
  // doesn't retroactively fix that — the same forced-reflow nudge
  // updateCardUI() uses for live content changes is needed here too, for
  // the "becoming visible for the first time" case specifically.
  nudgeActiveViewScroll();

  if (viewId === 'view-poster') {
    if (DOM.nav) DOM.nav.classList.add('hidden');
    renderPosterQr();
  } else if (viewId === 'view-signup' || viewId === 'view-splash' || viewId === 'view-admin-login') {
    if (DOM.nav) DOM.nav.classList.add('hidden');
  } else {
    if (DOM.nav) DOM.nav.classList.remove('hidden');
  }

  if (viewId === 'view-settings') {
    updateSettingsStats();
    if (!state.isAdmin && state.selectedCustomerId) {
      db.getCustomer(state.selectedCustomerId).then(c => refreshStudentPromoVisibility(c));
    }
  }
  if (viewId === 'view-activity') renderActivityList();
  if (viewId === 'view-leaderboard') renderLeaderboard();
  // Prices must be current the moment someone is actually looking at the
  // menu — don't rely solely on realtime having stayed connected since
  // boot (a backgrounded app, a dropped websocket, etc. shouldn't be able
  // to leave a stale price on screen at the moment it matters most).
  if (viewId === 'view-menu' || viewId === 'view-admin-menu') syncMenuFromCloud();
  if (viewId === 'view-menu' && !state.isAdmin && !state.menuPriceViewInitialized && state.selectedCustomerId) {
    state.menuPriceViewInitialized = true;
    db.getCustomer(state.selectedCustomerId).then(c => {
      if (c && c.isStudent) setMenuPriceView('student');
    });
  }

  const fabActions = document.getElementById('customers-fab-actions');
  if (fabActions) {
    if (viewId === 'view-customers') fabActions.classList.remove('hidden');
    else fabActions.classList.add('hidden');
  }
}

function renderPosterQr() {
  if (!DOM.posterQrcodeDisplay) return;
  const targetUrl = window.location.origin + window.location.pathname + '#signup';
  DOM.posterQrcodeDisplay.innerHTML = '';
  new QRCode(DOM.posterQrcodeDisplay, {
    text: targetUrl,
    width: 260,
    height: 260,
    colorDark: "#000000",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.H
  });
}

// Shared tail end of every staff-login path (email/password or Google) —
// stores the token exactly like the old shared-PIN flow used to, so
// session restore on reload works identically no matter how the token
// was obtained.
async function finishStaffLogin(result) {
  state.staffToken = result.token;
  state.staffName = result.name;
  toggleAdminMode(true);

  try {
    const self = await cloud.staffGetSelf(result.token);
    if (self) state.staffAvatar = self.avatar;
  } catch (e) {}
  localStorage.setItem('86_staff_session', JSON.stringify({ token: result.token, name: result.name, email: result.email, avatar: state.staffAvatar }));
  if (DOM.staffLoginError) DOM.staffLoginError.textContent = '';
  renderStaffProfile();

  try {
    const cloudCustomers = await cloud.pullAllCustomers(state.staffToken);
    if (cloudCustomers.length > 0) {
      for (const c of cloudCustomers) await db.saveCustomer(c);
      state.customers = await db.getAllCustomers();
      renderCustomersList();
      renderActivityList();
    }
  } catch (e) {}

  switchView('view-customers');
  showToast(`Welcome, ${result.name}!`, 'success');
}

function renderStaffProfile() {
  if (!state.isAdmin) return;
  if (DOM.staffProfileName) DOM.staffProfileName.textContent = state.staffName || 'Staff';
  if (DOM.staffAvatarDisplay) {
    DOM.staffAvatarDisplay.innerHTML = MONOCHROME_AVATARS[state.staffAvatar] || MONOCHROME_AVATARS.person;
  }
}

function toggleAdminMode(isActive) {
  state.isAdmin = isActive;
  // Desktop is blocked to a "use your phone" message for customers (see
  // the inline script in index.html's <head>), but staff run the admin
  // panel from a desktop all the time — make sure reaching admin mode
  // any way (not just the #admin route the head script already checks)
  // lifts the block for the rest of this tab's session.
  if (isActive) document.documentElement.classList.add('staff-desktop-ok');

  // Swap nav tabs: show admin-only tabs in admin mode, customer tabs otherwise
  DOM.customerNavItems.forEach(el => {
    if (isActive) el.classList.add('hidden');
    else el.classList.remove('hidden');
  });
  DOM.adminNavItems.forEach(el => {
    if (isActive) el.classList.remove('hidden');
    else el.classList.add('hidden');
  });

  // Hide the "Hi, [name]" greeting header in admin mode
  const homeHeader = document.querySelector('#view-home .home-header');
  if (homeHeader) {
    if (isActive) homeHeader.classList.add('hidden');
    else homeHeader.classList.remove('hidden');
  }
  
  const adminOnlyElements = document.querySelectorAll('.admin-only');
  adminOnlyElements.forEach(el => {
    if (isActive) el.classList.remove('hidden');
    else el.classList.add('hidden');
  });

  const customerOnlyElements = document.querySelectorAll('.customer-only');
  customerOnlyElements.forEach(el => {
    if (isActive) el.classList.add('hidden');
    else el.classList.remove('hidden');
  });

  if (isActive) {
    DOM.nav.classList.remove('hidden');
    document.getElementById('customer-actions').classList.add('hidden');
    if (DOM.campaignBanner) DOM.campaignBanner.classList.add('hidden');

    if (!state.selectedCustomerId) {
      DOM.punchcard.classList.add('hidden');
      DOM.adminEmptyState.classList.remove('hidden');
      DOM.adminActions.classList.add('hidden');
    } else {
      DOM.punchcard.classList.remove('hidden');
      DOM.adminEmptyState.classList.add('hidden');
      DOM.adminActions.classList.remove('hidden');
    }
  } else {
    document.getElementById('customer-actions').classList.remove('hidden');
    DOM.punchcard.classList.remove('hidden');
    DOM.adminEmptyState.classList.add('hidden');
    DOM.adminActions.classList.add('hidden');
  }
}

function openModal(modalEl) { if (modalEl) modalEl.classList.add('active'); }
function closeModal(modalEl) { if (modalEl) modalEl.classList.remove('active'); }

// Opens the existing Display Name modal in a mode with no way out except
// submitting a name — used right after a brand-new signup, since that
// account was created with only a placeholder name (see the New Card
// form, which deliberately doesn't ask for one up front anymore).
function promptMandatoryDisplayName() {
  if (!DOM.modalSetDisplayName) return;
  state.mandatoryDisplayNamePrompt = true;
  if (DOM.setDisplayNameInput) DOM.setDisplayNameInput.value = '';
  if (DOM.setDisplayNameError) DOM.setDisplayNameError.textContent = '';
  if (DOM.btnSetDisplayNameSkip) DOM.btnSetDisplayNameSkip.classList.add('hidden');
  openModal(DOM.modalSetDisplayName);
}

function initStampGrid() {
  DOM.stampGrid.innerHTML = '';
  for (let i = 0; i < MAX_STAMPS; i++) {
    const slot = document.createElement('div');
    slot.className = 'stamp-slot';

    const cup = document.createElement('div');
    cup.className = 'stamp-cup';
    cup.id = `stamp-${i}`;

    const icon = document.createElement('div');
    icon.className = 'cup-icon';
    icon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 8h1a4 4 0 1 1 0 8h-1M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8z"></path><line x1="6" y1="2" x2="6" y2="4"></line><line x1="10" y1="2" x2="10" y2="4"></line><line x1="14" y1="2" x2="14" y2="4"></line></svg>`;

    const check = document.createElement('div');
    check.className = 'stamp-check';
    check.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

    cup.appendChild(icon);
    cup.appendChild(check);
    slot.appendChild(cup);
    DOM.stampGrid.appendChild(slot);
  }
}

// If the greeting ("Hi, Name") is too long for its space (long name, or a
// language whose words run longer), scroll it back and forth instead of
// wrapping to a second line or squishing the avatar next to it.
function updateGreetingMarquee() {
  const el = DOM.homeGreeting;
  const wrap = el ? el.parentElement : null;
  if (!el || !wrap) return;
  el.classList.remove('marquee');
  el.style.removeProperty('--marquee-shift');
  const overflow = el.scrollWidth - wrap.clientWidth;
  if (overflow > 4) {
    el.style.setProperty('--marquee-shift', `-${overflow}px`);
    el.classList.add('marquee');
  }
}

const REWARD_EXPIRY_MS = 365 * 24 * 60 * 60 * 1000;
function isRewardExpired(customer) {
  if (!customer || !customer.rewardsEarned || !customer.rewardBankedAt) return false;
  const bankedTime = new Date(customer.rewardBankedAt).getTime();
  if (Number.isNaN(bankedTime)) return false;
  return (Date.now() - bankedTime) > REWARD_EXPIRY_MS;
}

// Days left before a banked reward hits the 1-year expiry. Null when
// there's no banked reward or the date is unreadable.
function getRewardDaysRemaining(customer) {
  if (!customer || !customer.rewardsEarned || !customer.rewardBankedAt) return null;
  const bankedTime = new Date(customer.rewardBankedAt).getTime();
  if (Number.isNaN(bankedTime)) return null;
  const msLeft = (bankedTime + REWARD_EXPIRY_MS) - Date.now();
  return Math.ceil(msLeft / (24 * 60 * 60 * 1000));
}

// Milestone badges based on lifetime stamps earned (never resets, unlike
// the current 0-10 progress bar which loops every reward).
const STAMP_BADGES = [
  { key: 'platinum', threshold: 250 },
  { key: 'gold', threshold: 100 },
  { key: 'silver', threshold: 50 },
  { key: 'bronze', threshold: 10 }
];
function getEarnedBadge(totalStampsEarned) {
  return STAMP_BADGES.find(b => (totalStampsEarned || 0) >= b.threshold) || null;
}

// Picks the right store link for the device viewing the app. Falls back
// to Android for anything that isn't clearly iOS, and returns '' (hides
// the promo entirely) if neither link is configured yet.
function netavilleStoreUrl() {
  const ua = navigator.userAgent || '';
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  if (isIOS) return NETAVILLE_IOS_URL || NETAVILLE_ANDROID_URL || '';
  return NETAVILLE_ANDROID_URL || NETAVILLE_IOS_URL || '';
}

// Student discount promo — only for customers who aren't verified yet,
// and only once real store links are configured (never point somewhere
// broken in the meantime). Called from updateCardUI() AND separately
// from updateSettingsStats(), since navigating straight to Settings
// doesn't go through updateCardUI() and was leaving this on stale data
// (e.g. still showing the promo right after staff verify someone, until
// they happened to revisit the Card tab).
function refreshStudentPromoVisibility(customer) {
  if (!DOM.studentPromoBanner || !DOM.btnStudentPromoDownload) return;
  const storeUrl = netavilleStoreUrl();
  const showPromo = !state.isAdmin && !!customer && !customer.isStudent && !!storeUrl;
  DOM.btnStudentPromoDownload.href = storeUrl || '#';
  DOM.studentPromoBanner.classList.toggle('hidden', !showPromo);
  if (DOM.settingsStudentSection && DOM.settingsStudentLink) {
    DOM.settingsStudentLink.href = storeUrl || '#';
    DOM.settingsStudentSection.classList.toggle('hidden', !showPromo);
  }
}

let lastCardCustomerId = null;
let cardBackRankCache = {};

// The 3D rotation (.flipped, in styles.css) is purely decorative — iOS
// Safari has proven unreliable at actually suppressing the away-facing
// side via either backface-visibility or a visibility:hidden fallback,
// both bitten by the same underlying iOS compositing bugs. This is what
// actually controls which face can be seen: display:none, toggled with
// a delay timed to the transform's midpoint (90deg — edge-on, so the
// instant swap is imperceptible regardless of which browser is
// rendering the rotation itself correctly). A display:none element is
// removed from the render tree entirely, so there's no compositor
// state left over for iOS to get wrong.
let cardFlipDisplayTimer = null;
let cardIntroFlipTimer = null;
let cardIntroFlipBackTimer = null;
function setCardFlipped(flipped) {
  if (!DOM.cardFlipInner) return;
  const alreadyFlipped = DOM.cardFlipInner.classList.contains('flipped');
  DOM.cardFlipInner.classList.toggle('flipped', flipped);
  if (alreadyFlipped === flipped) return;

  clearTimeout(cardFlipDisplayTimer);
  cardFlipDisplayTimer = setTimeout(() => {
    if (DOM.cardFaceFront) DOM.cardFaceFront.style.display = flipped ? 'none' : '';
    // .card-face-back's CSS default is display:none (styles.css), so
    // clearing its inline override falls back to hidden, not visible —
    // it needs an explicit 'block' when showing, unlike the front face.
    if (DOM.cardFaceBack) DOM.cardFaceBack.style.display = flipped ? 'block' : 'none';
  }, 300);
}

// One-time "peek at the back" reveal — flips to the stats side shortly
// after the card first appears, holds long enough to read it, then
// flips itself back. Timed off setCardFlipped's own 600ms transition so
// it never fights a tap the customer makes mid-animation (flipped state
// still toggles instantly; only the delayed intro calls are skipped).
function playCardIntroFlip() {
  if (!DOM.cardFlipInner) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  clearTimeout(cardIntroFlipTimer);
  clearTimeout(cardIntroFlipBackTimer);
  cardIntroFlipTimer = setTimeout(() => {
    setCardFlipped(true);
    cardIntroFlipBackTimer = setTimeout(() => setCardFlipped(false), 2200);
  }, 700);
}

function bumpStampCount() {
  if (!DOM.stampCount) return;
  DOM.stampCount.classList.remove('bump');
  void DOM.stampCount.offsetWidth; // restart the animation on rapid repeats
  DOM.stampCount.classList.add('bump');
  setTimeout(() => DOM.stampCount && DOM.stampCount.classList.remove('bump'), 400);
}

// Both faces are absolutely positioned (so they can overlap during the 3D
// flip), which takes them out of normal flow — .card-flip-inner needs an
// explicit height or it collapses to 0. Re-measure whenever either face's
// content could have changed size (stamp count, language, viewport width).
// Whichever face is currently display:none reports scrollHeight 0, which
// would undersize the card whenever that face is naturally the taller of
// the two — briefly force both visible for the measurement itself, then
// restore whatever display state they actually had.
function syncCardFlipHeight() {
  if (!DOM.cardFlipInner || !DOM.cardFaceFront || !DOM.cardFaceBack) return;
  const frontPrevDisplay = DOM.cardFaceFront.style.display;
  const backPrevDisplay = DOM.cardFaceBack.style.display;
  DOM.cardFaceFront.style.display = 'block';
  DOM.cardFaceBack.style.display = 'block';
  const h = Math.max(DOM.cardFaceFront.scrollHeight, DOM.cardFaceBack.scrollHeight);
  DOM.cardFaceFront.style.display = frontPrevDisplay;
  DOM.cardFaceBack.style.display = backPrevDisplay;
  if (h > 0) DOM.cardFlipInner.style.height = h + 'px';
}

async function updateCardBackStats(customer) {
  if (!DOM.cardBackStatLifetime) return;

  DOM.cardBackStatLifetime.textContent = customer.totalStampsEarned || 0;

  const redeemedCount = Array.isArray(customer.history)
    ? customer.history.filter(h => h.type === 'redemption' && !h.voided).length
    : 0;
  if (DOM.cardBackStatRedeemed) DOM.cardBackStatRedeemed.textContent = redeemedCount;

  if (DOM.cardBackStatSince) {
    const dt = customer.joinedAt ? new Date(customer.joinedAt) : null;
    DOM.cardBackStatSince.textContent = (dt && !isNaN(dt))
      ? dt.toLocaleDateString([], { month: 'short', year: 'numeric' })
      : '—';
  }

  // Rank needs its own network round-trip — show a placeholder, fetch it
  // lazily, and cache per customer so re-flipping doesn't refetch.
  if (DOM.cardBackStatRank) {
    const cached = cardBackRankCache[customer.id];
    if (cached) {
      DOM.cardBackStatRank.textContent = cached;
    } else {
      DOM.cardBackStatRank.textContent = '—';
      cloud.getMyRank(customer.id, 'all').then(res => {
        const label = res && res.rank ? `#${res.rank}` : '—';
        cardBackRankCache[customer.id] = label;
        if (state.selectedCustomerId === customer.id && DOM.cardBackStatRank) {
          DOM.cardBackStatRank.textContent = label;
          syncCardFlipHeight();
        }
      }).catch(() => {});
    }
  }

  syncCardFlipHeight();
}

async function updateCardUI() {
  if (!state.selectedCustomerId) {
    DOM.homeGreeting.textContent = t('homeGreetingGuest');
    DOM.homeSubtitle.textContent = t('homeSubtitleGuest');
    DOM.cardNumber.textContent = "CARD #---";
    for (let i = 0; i < MAX_STAMPS; i++) {
      const cup = document.getElementById(`stamp-${i}`);
      if (cup) cup.classList.remove('earned', 'earning');
    }
    DOM.progressFill.style.width = `0%`;
    DOM.stampCountText.textContent = 0;
    if (DOM.rewardsWalletCard) DOM.rewardsWalletCard.classList.add('hidden');
    if (DOM.btnLogoutHeader) DOM.btnLogoutHeader.classList.add('hidden');
    if (DOM.btnOpenNotifications) DOM.btnOpenNotifications.classList.add('hidden');
    if (DOM.userAvatarDisplay) DOM.userAvatarDisplay.innerHTML = MONOCHROME_AVATARS.person;
    updateGreetingMarquee();
    setCardFlipped(false);
    lastCardCustomerId = null;
    return;
  }

  const customer = await db.getCustomer(state.selectedCustomerId);
  if (!customer) return;

  if (lastCardCustomerId !== customer.id) {
    lastCardCustomerId = customer.id;
    setCardFlipped(false);
    // First time this customer's own card appears this session — give it
    // a quick flip-and-back so the stats on the back (lifetime stamps,
    // redemptions, rank) actually get noticed at least once, instead of
    // sitting undiscovered behind a tap gesture nobody knows to try.
    // Admin/staff scanning through customers should never see this.
    if (!state.isAdmin) playCardIntroFlip();
  }

  DOM.homeGreeting.textContent = t('hiName', { name: customer.name });
  DOM.cardNumber.textContent = `CARD #${customer.id.substring(0, 6)}`;
  updateGreetingMarquee();

  // Render Customer 2D Monochrome Avatar
  if (DOM.userAvatarDisplay) {
    const avatarKey = customer.avatar || 'person';
    DOM.userAvatarDisplay.innerHTML = MONOCHROME_AVATARS[avatarKey] || MONOCHROME_AVATARS.person;
  }

  // Lifetime milestone badge (never resets, unlike the 0-10 progress bar)
  if (DOM.stampBadge && DOM.stampBadgeLabel) {
    const badge = getEarnedBadge(customer.totalStampsEarned);
    if (badge) {
      DOM.stampBadgeLabel.textContent = t('badge_' + badge.key);
      DOM.stampBadge.classList.remove('hidden');
    } else {
      DOM.stampBadge.classList.add('hidden');
    }
  }

  // Verified-student badge — set once by staff, then shown automatically
  // on every future visit so a second app/QR is never needed again.
  if (DOM.studentBadge) DOM.studentBadge.classList.toggle('hidden', !customer.isStudent);
  if (DOM.btnToggleStudent && DOM.btnToggleStudentLabel) {
    DOM.btnToggleStudent.classList.toggle('active', !!customer.isStudent);
    DOM.btnToggleStudentLabel.textContent = customer.isStudent ? t('btnUnmarkStudent') : t('btnMarkStudent');
  }

  const stamps = customer.stamps;
  for (let i = 0; i < MAX_STAMPS; i++) {
    const cup = document.getElementById(`stamp-${i}`);
    if (cup) {
      if (i < stamps) cup.classList.add('earned');
      else cup.classList.remove('earned', 'earning');
    }
  }

  const percentage = (stamps / MAX_STAMPS) * 100;
  DOM.progressFill.style.width = `${percentage}%`;
  DOM.stampCountText.textContent = stamps;

  const stampsNeeded = MAX_STAMPS - stamps;
  if (stampsNeeded <= 0) {
    DOM.homeSubtitle.textContent = t('homeSubtitleRewardReady');
    DOM.progressMsg.textContent = t('progressMsgRewardReady');
    DOM.progressMsg.style.color = "var(--accent-main)";
  } else {
    DOM.homeSubtitle.textContent = t('homeSubtitleDigital');

    DOM.progressMsg.textContent = t('progressMsgStampsNeeded', { n: stampsNeeded });
    DOM.progressMsg.style.color = "var(--text-muted)";
  }

  // Rewards Wallet Display
  const unclaimed = customer.rewardsEarned || 0;
  const expired = isRewardExpired(customer);
  if (DOM.rewardsWalletCard && DOM.walletCountText) {
    if (unclaimed > 0 && !state.isAdmin) {
      DOM.rewardsWalletCard.classList.remove('hidden');
      if (expired) {
        DOM.walletCountText.textContent = t('walletExpiredText');
        if (DOM.walletExpiryText) DOM.walletExpiryText.textContent = '';
        if (DOM.btnRedeemBanked) DOM.btnRedeemBanked.disabled = true;
      } else {
        DOM.walletCountText.textContent = unclaimed > 1
          ? t('walletCountPlural', { n: unclaimed })
          : t('walletCountSingular');
        if (DOM.walletExpiryText) {
          const daysLeft = getRewardDaysRemaining(customer);
          if (daysLeft === null) {
            DOM.walletExpiryText.textContent = '';
          } else if (daysLeft <= 0) {
            DOM.walletExpiryText.textContent = t('walletExpiresToday');
          } else if (daysLeft === 1) {
            DOM.walletExpiryText.textContent = t('walletExpiresInDay');
          } else {
            DOM.walletExpiryText.textContent = t('walletExpiresInDays', { n: daysLeft });
          }
        }
        if (DOM.btnRedeemBanked) DOM.btnRedeemBanked.disabled = false;
      }
    } else {
      DOM.rewardsWalletCard.classList.add('hidden');
    }
  }

  if (DOM.btnLogoutHeader) {
    if (state.myCustomerId && !state.isAdmin) {
      DOM.btnLogoutHeader.classList.remove('hidden');
    } else {
      DOM.btnLogoutHeader.classList.add('hidden');
    }
  }

  if (DOM.btnOpenNotifications) {
    if (state.myCustomerId && !state.isAdmin) {
      DOM.btnOpenNotifications.classList.remove('hidden');
      refreshNotifBadge();
    } else {
      DOM.btnOpenNotifications.classList.add('hidden');
    }
  }

  if (!state.isAdmin) refreshCustomerCampaignBanner();

  refreshStudentPromoVisibility(customer);
  updateCardBackStats(customer);

  if (state.isAdmin) {
    DOM.btnAddStamp.disabled = stamps >= MAX_STAMPS;
    if (DOM.btnRemoveStamp) DOM.btnRemoveStamp.disabled = stamps <= 0;
  }

  if (state.isAdmin && state.selectedCustomerId) {
    DOM.punchcard.classList.remove('hidden');
    DOM.adminEmptyState.classList.add('hidden');
    DOM.adminActions.classList.remove('hidden');

    if (DOM.btnAdminRedeem && DOM.btnAdminRedeemLabel) {
      if (unclaimed > 0) {
        DOM.btnAdminRedeem.classList.remove('hidden');
        DOM.btnAdminRedeemLabel.textContent = unclaimed > 1
          ? t('btnRedeemBankedPlural', { n: unclaimed })
          : t('btnRedeemBanked');
      } else {
        DOM.btnAdminRedeem.classList.add('hidden');
      }
    }

    if (DOM.btnVoidRedemption) {
      DOM.btnVoidRedemption.classList.toggle('hidden', !canVoidRedemption(customer));
    }
  }

  nudgeActiveViewScroll();
}

// iOS Safari can get an overflow:auto view's touch-scroll recognizer
// stuck when the view's content height changes while it's on-screen and
// untouched — e.g. a live stamp update growing/shrinking the wallet
// card, reward banner, or student promo. switchView() already guards
// against the same freeze for tab navigation (resetting scrollTop so a
// stale offset never sits past a new, shorter scrollHeight), but that
// only runs when a view becomes active — not when its content changes
// under a tab the customer is already sitting on. Toggling overflow off
// and back on forces iOS to recompute the scrollable region against the
// new layout instead of leaving stale gesture state around one it no
// longer matches.
function nudgeActiveViewScroll() {
  DOM.views.forEach(view => {
    if (!view.classList.contains('active')) return;
    const scrollEl = getScrollableEl(view);
    const maxScroll = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight);
    if (scrollEl.scrollTop > maxScroll) scrollEl.scrollTop = maxScroll;
    scrollEl.style.overflow = 'hidden';
    void scrollEl.offsetHeight;
    scrollEl.style.overflow = '';
  });
}

function canVoidRedemption(customer) {
  const last = customer && Array.isArray(customer.history) ? customer.history[0] : null;
  return !!(last && last.type === 'redemption' && !last.voided);
}

// ==========================================
// NOTIFICATIONS PANEL
// ==========================================
// Monochrome line icons (matches the rest of the app's icon set — e.g.
// the gift/coffee paths are the same ones used on the card back) instead
// of full-color emoji, which stood out against the app's monochrome
// design system.
const NOTIF_TYPE_ICON = {
  friend_request: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>',
  friend_accepted: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>',
  gift_received: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12v10H4V12"></path><path d="M2 7h20v5H2z"></path><path d="M12 22V7"></path><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"></path><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"></path></svg>',
  reward_banked: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8z"></path><line x1="6" y1="2" x2="6" y2="4"></line><line x1="10" y1="2" x2="10" y2="4"></line><line x1="14" y1="2" x2="14" y2="4"></line></svg>',
  referral_bonus: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>',
  milestone_reached: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="7"></circle><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline></svg>'
};
const NOTIF_TYPE_ICON_DEFAULT = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>';

// Notification titles are written server-side (Supabase SQL functions)
// and still lead with a colored emoji (e.g. "🎉 Friend request
// accepted") from before the panel switched to its own monochrome
// NOTIF_TYPE_ICON per row — that context now makes the emoji redundant
// as well as visually inconsistent. Stripped client-side rather than
// requiring a DB migration, so it's fixed for every row regardless of
// which SQL version last wrote it.
function stripLeadingEmoji(str) {
  return (str || '').replace(/^[\p{Extended_Pictographic}️‍]+\s*/u, '');
}

function formatNotifTime(iso) {
  const then = new Date(iso).getTime();
  if (!then || isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return t('timeJustNow');
  if (mins < 60) return t('timeMinutesAgo', { n: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t('timeHoursAgo', { n: hours });
  const days = Math.floor(hours / 24);
  return t('timeDaysAgo', { n: days });
}

// Badge-only refresh — cheap enough to call often (app init, returning to
// the home view, after opening/closing the panel) without pulling the
// full notification list each time.
async function refreshNotifBadge() {
  if (!DOM.notifBellBadge || !state.myCustomerId || state.isAdmin) return;
  const count = await cloud.unreadNotificationCount(state.myToken);
  DOM.notifBellBadge.classList.toggle('hidden', count <= 0);
}

async function loadAndRenderNotifications() {
  if (!DOM.notificationsList) return;
  DOM.notificationsList.innerHTML = `<div class="empty-state" style="padding: 24px 0;"><p class="empty-text">${t('loadingText')}</p></div>`;
  const notifications = await cloud.listNotifications(state.myToken);
  renderNotificationsList(notifications);

  // Flash the unread state on open (so what's new is still visible this
  // one time), then clear it server-side so the badge is gone by the
  // next time the panel — or the app — opens.
  if (notifications.some(n => !n.read)) {
    cloud.markAllNotificationsRead(state.myToken).then(() => refreshNotifBadge());
  }
}

function renderNotificationsList(notifications) {
  if (!DOM.notificationsList) return;
  DOM.notificationsList.innerHTML = '';

  if (DOM.btnClearAllNotifications) {
    DOM.btnClearAllNotifications.classList.toggle('hidden', !notifications.length);
  }

  if (!notifications.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.style.padding = '24px 0';
    const p = document.createElement('p');
    p.className = 'empty-text';
    p.textContent = t('notifPanelEmpty');
    empty.appendChild(p);
    DOM.notificationsList.appendChild(empty);
    return;
  }

  notifications.forEach(n => {
    const row = document.createElement('div');
    row.className = 'notif-row' + (n.read ? '' : ' unread');
    row.dataset.id = n.id;

    const icon = document.createElement('div');
    icon.className = 'notif-row-icon';
    icon.innerHTML = NOTIF_TYPE_ICON[n.type] || NOTIF_TYPE_ICON_DEFAULT;
    row.appendChild(icon);

    const content = document.createElement('div');
    content.className = 'notif-row-content';

    const title = document.createElement('div');
    title.className = 'notif-row-title';
    title.textContent = stripLeadingEmoji(n.title);
    content.appendChild(title);

    const body = document.createElement('div');
    body.className = 'notif-row-body';
    body.textContent = n.body;
    content.appendChild(body);

    const time = document.createElement('div');
    time.className = 'notif-row-time';
    time.textContent = formatNotifTime(n.createdAt);
    content.appendChild(time);

    row.appendChild(content);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'notif-row-delete';
    deleteBtn.dataset.id = n.id;
    deleteBtn.setAttribute('aria-label', t('btnClose'));
    deleteBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    row.appendChild(deleteBtn);

    // Friend requests are still actionable from right here — no need to
    // dig into the Friends modal separately to respond to one. A direct
    // child of .row (not nested in .notif-row-content), with flex-basis:
    // 100% (styles.css) so it wraps onto its own full-width line below
    // the icon+text — spanning the whole row edge to edge instead of
    // being squeezed into the narrower text column next to the icon.
    if (n.type === 'friend_request' && n.data && n.data.request_id) {
      const actions = document.createElement('div');
      actions.className = 'notif-row-actions';

      const acceptBtn = document.createElement('button');
      acceptBtn.className = 'btn-primary notif-accept-btn';
      acceptBtn.dataset.requestId = n.data.request_id;
      acceptBtn.dataset.requestName = (n.data && n.data.requester_name) || '';
      acceptBtn.textContent = t('btnAcceptRequest');
      actions.appendChild(acceptBtn);

      const declineBtn = document.createElement('button');
      declineBtn.className = 'btn-secondary notif-decline-btn';
      declineBtn.dataset.requestId = n.data.request_id;
      declineBtn.textContent = t('btnDeclineRequest');
      actions.appendChild(declineBtn);

      row.appendChild(actions);
    }

    DOM.notificationsList.appendChild(row);
  });
}

// ==========================================
// FRIENDS & GIFTING
// ==========================================
async function loadAndRenderFriends() {
  if (!DOM.friendsList) return;
  DOM.friendsList.innerHTML = `<div class="empty-state" style="padding: 24px 0;"><p class="empty-text">${t('loadingText')}</p></div>`;
  const [requests, friends] = await Promise.all([
    cloud.listPendingRequests(state.myToken),
    cloud.listFriends(state.myToken)
  ]);
  renderFriendRequests(requests);
  renderFriendsList(friends);
}

function renderFriendRequests(requests) {
  if (!DOM.friendRequestsSection || !DOM.friendRequestsList) return;

  if (!requests.length) {
    DOM.friendRequestsSection.classList.add('hidden');
    DOM.friendRequestsList.innerHTML = '';
    return;
  }

  DOM.friendRequestsSection.classList.remove('hidden');
  DOM.friendRequestsList.innerHTML = '';

  requests.forEach(req => {
    const row = document.createElement('div');
    row.className = 'friend-request-row';

    const top = document.createElement('div');
    top.className = 'friend-request-top';

    const avatar = document.createElement('div');
    avatar.className = 'friend-row-avatar';
    const img = document.createElement('img');
    img.src = avatarUrl(req.avatar);
    img.alt = '';
    img.loading = 'lazy';
    avatar.appendChild(img);
    top.appendChild(avatar);

    const name = document.createElement('div');
    name.className = 'friend-row-name';
    name.textContent = req.name;
    top.appendChild(name);

    row.appendChild(top);

    const actions = document.createElement('div');
    actions.className = 'friend-request-actions';

    const declineBtn = document.createElement('button');
    declineBtn.className = 'btn-secondary friend-request-decline-btn';
    declineBtn.dataset.requestId = req.requestId;
    declineBtn.dataset.requestName = req.name;
    declineBtn.textContent = t('btnDeclineRequest');
    actions.appendChild(declineBtn);

    const acceptBtn = document.createElement('button');
    acceptBtn.className = 'btn-primary friend-request-accept-btn';
    acceptBtn.dataset.requestId = req.requestId;
    acceptBtn.dataset.requestName = req.name;
    acceptBtn.dataset.requesterId = req.id;
    acceptBtn.textContent = t('btnAcceptRequest');
    actions.appendChild(acceptBtn);

    row.appendChild(actions);

    DOM.friendRequestsList.appendChild(row);
  });
}

async function renderFriendsList(friends) {
  if (!DOM.friendsList) return;
  DOM.friendsList.innerHTML = '';

  if (!friends.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.style.padding = '24px 0';
    const p = document.createElement('p');
    p.className = 'empty-text';
    p.textContent = t('friendsEmpty');
    empty.appendChild(p);
    DOM.friendsList.appendChild(empty);
    return;
  }

  const me = state.myCustomerId ? await db.getCustomer(state.myCustomerId) : null;
  const canGift = !!me && (me.rewardsEarned || 0) > 0;

  friends.forEach(friend => {
    const row = document.createElement('div');
    row.className = 'friend-row';

    const avatar = document.createElement('div');
    avatar.className = 'friend-row-avatar';
    const img = document.createElement('img');
    img.src = avatarUrl(friend.avatar);
    img.alt = '';
    img.loading = 'lazy';
    avatar.appendChild(img);
    row.appendChild(avatar);

    const name = document.createElement('div');
    name.className = 'friend-row-name';
    name.textContent = friend.name;
    row.appendChild(name);

    const giftBtn = document.createElement('button');
    giftBtn.className = 'friend-row-gift-btn';
    giftBtn.dataset.friendId = friend.id;
    giftBtn.dataset.friendName = friend.name;
    giftBtn.disabled = !canGift;
    giftBtn.title = canGift ? t('btnGiftReward') : t('errNoRewardToGift');
    giftBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 12 20 22 4 22 4 12"></polyline><rect x="2" y="7" width="20" height="5"></rect><line x1="12" y1="22" x2="12" y2="7"></line><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"></path><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"></path></svg>';
    row.appendChild(giftBtn);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'friend-row-remove-btn';
    removeBtn.dataset.friendId = friend.id;
    removeBtn.dataset.friendName = friend.name;
    removeBtn.setAttribute('aria-label', 'Remove friend');
    removeBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    row.appendChild(removeBtn);

    DOM.friendsList.appendChild(row);
  });
}

function openGiftConfirm(friendId, friendName) {
  if (!DOM.modalConfirmGift || !DOM.btnConfirmGift) return;
  DOM.btnConfirmGift.dataset.friendId = friendId;
  if (DOM.confirmGiftText) DOM.confirmGiftText.textContent = t('confirmGiftText', { name: friendName });
  openModal(DOM.modalConfirmGift);
}

function openRemoveFriendConfirm(friendId, friendName) {
  if (!DOM.modalConfirmRemoveFriend || !DOM.btnConfirmRemoveFriend) return;
  DOM.btnConfirmRemoveFriend.dataset.friendId = friendId;
  if (DOM.confirmRemoveFriendText) DOM.confirmRemoveFriendText.textContent = t('confirmRemoveFriendText', { name: friendName });
  openModal(DOM.modalConfirmRemoveFriend);
}

async function removeFriendAndRerender(friendId) {
  await cloud.removeFriend(state.myToken, friendId);
  await loadAndRenderFriends();
}

function updateSettingsStats() {
  if (!state.isAdmin) return;
  renderStaffProfile();

  let stampsToday = 0;
  let rewardsGiven = 0;
  const todayStr = new Date().toISOString().split('T')[0];

  // "This week" = last 7 days, "this month" = last 30 — rolling windows
  // rather than calendar week/month, so the numbers stay meaningful no
  // matter what day it is (a calendar-week counter would read almost
  // empty every Monday morning).
  const now = Date.now();
  const weekCutoff = now - 7 * 24 * 60 * 60 * 1000;
  const monthCutoff = now - 30 * 24 * 60 * 60 * 1000;
  let stampsWeek = 0;
  let stampsMonth = 0;
  let redemptionsMonth = 0;
  const drinkCounts = {};

  // staffName -> { today, total, rewardsToday } — lets the profile
  // screen show both "my" numbers and a per-teammate breakdown from the
  // same single pass over everyone's history.
  const perStaff = {};
  const bump = (name) => {
    const key = name || 'Unknown';
    if (!perStaff[key]) perStaff[key] = { today: 0, total: 0, rewardsToday: 0 };
    return perStaff[key];
  };

  state.customers.forEach(c => {
    if (c.history && Array.isArray(c.history)) {
      c.history.forEach(h => {
        const isToday = h.timestamp && h.timestamp.startsWith(todayStr);
        const entryTime = h.timestamp ? new Date(h.timestamp).getTime() : NaN;
        if (h.type === 'stamp') {
          const amount = h.stamps || 1;
          if (isToday) stampsToday += amount;
          if (!Number.isNaN(entryTime)) {
            if (entryTime >= weekCutoff) stampsWeek += amount;
            if (entryTime >= monthCutoff) {
              stampsMonth += amount;
              const drinkName = (h.drink || 'Unknown').trim();
              drinkCounts[drinkName] = (drinkCounts[drinkName] || 0) + 1;
            }
          }
          const s = bump(h.staffName);
          s.total += amount;
          if (isToday) s.today += amount;
        } else if (h.type === 'redemption') {
          if (isToday) {
            rewardsGiven += 1;
            bump(h.staffName).rewardsToday += 1;
          }
          if (!h.voided && !Number.isNaN(entryTime) && entryTime >= monthCutoff) redemptionsMonth += 1;
        }
      });
    }
  });

  if (DOM.statStampsToday) DOM.statStampsToday.textContent = stampsToday;
  if (DOM.statRewardsGiven) DOM.statRewardsGiven.textContent = rewardsGiven;
  if (DOM.statActiveCards) DOM.statActiveCards.textContent = state.customers.length;
  if (DOM.statStampsWeek) DOM.statStampsWeek.textContent = stampsWeek;
  if (DOM.statStampsMonth) DOM.statStampsMonth.textContent = stampsMonth;
  if (DOM.statRedemptionsMonth) DOM.statRedemptionsMonth.textContent = redemptionsMonth;

  if (DOM.topDrinksList) {
    DOM.topDrinksList.innerHTML = '';
    const topDrinks = Object.keys(drinkCounts).sort((a, b) => drinkCounts[b] - drinkCounts[a]).slice(0, 5);
    if (!topDrinks.length) {
      const empty = document.createElement('div');
      empty.className = 'staff-stat-row';
      empty.style.opacity = '0.6';
      empty.textContent = 'No stamps in the last 30 days yet.';
      DOM.topDrinksList.appendChild(empty);
    } else {
      topDrinks.forEach(name => {
        const row = document.createElement('div');
        row.className = 'staff-stat-row';

        const nameEl = document.createElement('span');
        nameEl.className = 'staff-stat-row-name';
        nameEl.textContent = name;

        const countEl = document.createElement('span');
        countEl.className = 'staff-stat-row-count';
        countEl.textContent = `${drinkCounts[name]}×`;

        row.appendChild(nameEl);
        row.appendChild(countEl);
        DOM.topDrinksList.appendChild(row);
      });
    }
  }

  const mine = perStaff[state.staffName] || { today: 0, total: 0, rewardsToday: 0 };
  if (DOM.statMyStampsToday) DOM.statMyStampsToday.textContent = mine.today;
  if (DOM.statMyRewardsToday) DOM.statMyRewardsToday.textContent = mine.rewardsToday;
  if (DOM.statMyStampsTotal) DOM.statMyStampsTotal.textContent = mine.total;

  if (DOM.staffTeamStatsList) {
    DOM.staffTeamStatsList.innerHTML = '';
    Object.keys(perStaff)
      .sort((a, b) => perStaff[b].total - perStaff[a].total)
      .forEach(name => {
        const row = document.createElement('div');
        row.className = 'staff-stat-row';

        const nameEl = document.createElement('span');
        nameEl.className = 'staff-stat-row-name';
        nameEl.textContent = name;

        const countEl = document.createElement('span');
        countEl.className = 'staff-stat-row-count';
        countEl.textContent = `${perStaff[name].total} lifetime · ${perStaff[name].today} today`;

        row.appendChild(nameEl);
        row.appendChild(countEl);
        DOM.staffTeamStatsList.appendChild(row);
      });
  }

  refreshCampaignStatus();
}

async function refreshCampaignStatus() {
  if (!DOM.campaignToggle) return;
  const status = await cloud.getCampaignStatus();
  if (!status) return;
  state.campaign = status;
  DOM.campaignToggle.checked = !!status.active;
  DOM.campaignStatusText.textContent = status.active
    ? `Active — ${status.multiplier}x stamps`
    : t('campaignInactive');
}

async function refreshCustomerCampaignBanner() {
  if (!DOM.campaignBanner) return;
  const status = await cloud.getCampaignStatus();
  state.campaign = status;
  if (status && status.active) {
    DOM.campaignBanner.classList.remove('hidden');
  } else {
    DOM.campaignBanner.classList.add('hidden');
  }
}

// SAFE DOM CONSTRUCTION FOR STORED XSS PREVENTION
function renderCustomersList(searchTerm = '') {
  DOM.customerList.innerHTML = '';
  DOM.totalCustomersBadge.textContent = state.customers.length;

  let filtered = state.customers;
  if (searchTerm.trim() !== '') {
    const term = searchTerm.toLowerCase();
    filtered = state.customers.filter(c =>
      (c.name && c.name.toLowerCase().includes(term)) || (c.phone && c.phone.toLowerCase().includes(term)) || (c.id && c.id.toLowerCase().includes(term))
    );
  }

  let sorted = filtered.slice().reverse();
  if (state.customerSort === 'regulars') {
    sorted = filtered
      .filter(c => (c.totalStampsEarned || 0) >= REGULARS_MIN_STAMPS)
      .sort((a, b) => (b.totalStampsEarned || 0) - (a.totalStampsEarned || 0));
  }

  sorted.forEach(customer => {
    const el = document.createElement('div');
    el.className = `customer-card ${state.selectedCustomerId === customer.id ? 'selected' : ''}`;

    const avatar = document.createElement('div');
    avatar.className = 'customer-avatar';
    const avatarKey = customer.avatar || 'person';
    avatar.innerHTML = MONOCHROME_AVATARS[avatarKey] || MONOCHROME_AVATARS.person;

    const info = document.createElement('div');
    info.className = 'customer-info';

    const nameEl = document.createElement('div');
    nameEl.className = 'customer-name';
    nameEl.textContent = `${customer.name} (${customer.id.substring(0, 8)})`;

    const phoneEl = document.createElement('div');
    phoneEl.className = 'customer-phone';
    phoneEl.textContent = customer.phone || 'No username';
    if (state.customerSort === 'regulars') {
      phoneEl.textContent += ` · ${customer.totalStampsEarned || 0} lifetime stamps`;
    }

    info.appendChild(nameEl);
    info.appendChild(phoneEl);

    const miniStamps = document.createElement('div');
    miniStamps.className = 'customer-stamps-mini';
    for (let i = 0; i < 10; i++) {
      const dot = document.createElement('div');
      dot.className = `mini-dot ${i < customer.stamps ? 'filled' : ''}`;
      miniStamps.appendChild(dot);
    }

    el.appendChild(avatar);
    el.appendChild(info);
    el.appendChild(miniStamps);

    if (state.isAdmin) {
      const editBtn = document.createElement('button');
      editBtn.className = 'customer-edit-btn';
      editBtn.setAttribute('aria-label', `Edit ${customer.name}`);
      editBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path></svg>`;
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        state.editingCustomerId = customer.id;
        if (DOM.editCustomerIdText) DOM.editCustomerIdText.textContent = `ID: ${customer.id}`;
        if (DOM.editCustomerName) DOM.editCustomerName.value = customer.name || '';
        if (DOM.editCustomerPhone) DOM.editCustomerPhone.value = customer.phone || '';
        if (DOM.editCustomerNewPassword) DOM.editCustomerNewPassword.value = '';
        if (DOM.editCustomerPasswordError) DOM.editCustomerPasswordError.textContent = '';
        document.querySelectorAll('#edit-customer-password-requirements .pw-req').forEach(el => el.classList.remove('met'));
        openModal(DOM.modalEditCustomer);
      });
      el.appendChild(editBtn);
    }

    el.addEventListener('click', () => {
      state.selectedCustomerId = customer.id;
      updateCardUI();
      renderCustomersList(searchTerm);
      switchView('view-home');
    });

    DOM.customerList.appendChild(el);
  });
}

// RENDER ACTIVITY LOG LIST (NO 3D EMOJIS — 2D LINE SVGs ONLY)
function renderActivityList(searchTerm = '') {
  if (!DOM.activityList) return;
  DOM.activityList.innerHTML = '';

  const allLogs = [];
  state.customers.forEach(c => {
    if (c.history && Array.isArray(c.history)) {
      c.history.forEach(h => {
        allLogs.push({
          ...h,
          customerName: c.name || 'Unnamed',
          customerId: c.id,
          phone: c.phone
        });
      });
    }
  });

  allLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  let filtered = allLogs;

  if (state.activityFilter && state.activityFilter !== 'all') {
    filtered = filtered.filter(l => l.type === state.activityFilter);
  }

  if (searchTerm.trim() !== '') {
    const term = searchTerm.toLowerCase();
    filtered = filtered.filter(l =>
      l.customerName.toLowerCase().includes(term) ||
      l.customerId.toLowerCase().includes(term) ||
      (l.drink && l.drink.toLowerCase().includes(term)) ||
      (l.type && l.type.toLowerCase().includes(term))
    );
  }

  if (DOM.totalActivityBadge) DOM.totalActivityBadge.textContent = filtered.length;

  if (filtered.length === 0) {
    DOM.activityList.innerHTML = `
      <div class="empty-state" style="padding: 40px 20px;">
        <div class="empty-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
        </div>
        <h3 class="empty-title">No Activity Logged</h3>
        <p class="empty-text">Redemptions and stamp activity will appear here.</p>
      </div>
    `;
    return;
  }

  filtered.forEach(log => {
    const el = document.createElement('div');
    el.className = 'customer-card';

    const avatar = document.createElement('div');
    avatar.className = 'customer-avatar';
    if (log.type === 'redemption') {
      avatar.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 12 20 22 4 22 4 12"></polyline><rect x="2" y="7" width="20" height="5"></rect><line x1="12" y1="22" x2="12" y2="7"></line><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"></path><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"></path></svg>`;
    } else if (log.type === 'stamp_removed' || log.type === 'void') {
      avatar.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="8" y1="12" x2="16" y2="12"></line></svg>`;
    } else {
      avatar.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8z"></path><line x1="6" y1="2" x2="6" y2="4"></line><line x1="10" y1="2" x2="10" y2="4"></line><line x1="14" y1="2" x2="14" y2="4"></line></svg>`;
    }

    const info = document.createElement('div');
    info.className = 'customer-info';

    const nameEl = document.createElement('div');
    nameEl.className = 'customer-name';
    nameEl.textContent = `${log.customerName} (${log.customerId.substring(0, 8)})`;

    const descEl = document.createElement('div');
    descEl.className = 'customer-phone';
    descEl.style.color = log.type === 'redemption' ? 'var(--accent-main)' : 'var(--text-secondary)';

    const dt = new Date(log.timestamp);
    const dateStr = dt.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    const timeStr = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    let actionLabel;
    if (log.type === 'redemption') actionLabel = log.voided ? 'Free Coffee Redeemed (Voided)' : 'Free Coffee Redeemed';
    else if (log.type === 'stamp_removed') actionLabel = 'Stamp Removed';
    else if (log.type === 'void') actionLabel = 'Redemption Voided';
    else actionLabel = log.drink || 'Stamps Added';

    const staffSuffix = log.staffName ? ` · by ${log.staffName}` : '';
    descEl.textContent = `${actionLabel}${staffSuffix} • ${dateStr} at ${timeStr}`;

    info.appendChild(nameEl);
    info.appendChild(descEl);

    el.appendChild(avatar);
    el.appendChild(info);

    DOM.activityList.appendChild(el);
  });
}


// ==========================================
// STAMP FEEDBACK (sound + haptics)
// Generated in-browser via Web Audio — no external audio asset needed.
// ==========================================
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playTone(freq, startTime, duration, ctx, gainPeak = 0.18) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(gainPeak, startTime + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

function playStampSound() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  playTone(880, now, 0.12, ctx);
  playTone(1318.5, now + 0.07, 0.16, ctx);
}

function playRewardSound() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  [880, 1108.7, 1318.5, 1760].forEach((freq, i) => {
    playTone(freq, now + i * 0.08, 0.2, ctx, 0.16);
  });
}

function hapticPulse(pattern) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

// Browsers only let an AudioContext actually start on/after a genuine user
// gesture — creating or resuming it from an async callback (like a realtime
// stamp update arriving while the customer is just passively looking at
// their card, having tapped nothing since) is silently ignored, so no sound
// plays even though nothing errors. This is why sound worked for staff
// (their own tap on the drink button was the gesture) but not for the
// customer receiving it passively — there's no way around that from code,
// it's a platform rule, not a bug.
//
// What IS fixable: getting the context unlocked as early and as durably as
// possible so it's already running by the time a stamp arrives.
//   - Listen on every plausible first-interaction event (not just one), and
//     keep listening for the app's whole lifetime instead of unsubscribing
//     after the first hit — iOS/Chrome can silently re-suspend an idle
//     AudioContext after the tab sits backgrounded for a while, so a taps a
//     minute apart should each get a chance to re-resume it.
//   - Also try to resume on tab-foreground: this can't unlock a context
//     that's never been started (that still needs a real gesture), but it
//     CAN successfully resume one that was already unlocked earlier in the
//     session and got auto-suspended while backgrounded — no fresh gesture
//     required for that case per spec.
function unlockAudio() { getAudioCtx(); }
['pointerdown', 'touchstart', 'keydown', 'click'].forEach(evt => {
  document.addEventListener(evt, unlockAudio, { passive: true });
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
});

let toastHideTimer = null;
function showToast(message, type = 'info', options = {}) {
  DOM.toastMessage.textContent = message;
  if (options.avatar && MONOCHROME_AVATARS[options.avatar]) {
    DOM.toastIcon.classList.add('toast-avatar');
    DOM.toastIcon.innerHTML = MONOCHROME_AVATARS[options.avatar];
  } else {
    DOM.toastIcon.classList.remove('toast-avatar');
    DOM.toastIcon.textContent = type === 'success' ? '✓' : (type === 'error' ? '✕' : 'ℹ');
  }
  DOM.toast.classList.add('show');
  clearTimeout(toastHideTimer);
  toastHideTimer = setTimeout(() => DOM.toast.classList.remove('show'), options.duration || 2500);
}

// Gold/Platinum tier celebration — triggered from the cloud-polling
// comparison in startCloudPolling() the moment totalStampsEarned
// crosses a new tier's threshold. Purely a client-side "nice!" moment;
// the actual bonus stamps were already granted server-side by
// staff_add_stamp when the crossing happened.
function showMilestoneCelebration(tier, bonus) {
  if (!DOM.milestoneOverlay) return;
  const tierLabel = t('badge_' + tier);
  if (DOM.milestoneTitle) DOM.milestoneTitle.textContent = t('milestoneTitle', { tier: tierLabel });
  if (DOM.milestoneSubtitle) DOM.milestoneSubtitle.textContent = t('milestoneSubtitle', { tier: tierLabel, n: bonus });
  openModal(DOM.milestoneOverlay);
  fireConfetti();
}

// ==========================================
// CONFETTI ANIMATION
// ==========================================
function fireConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const pieces = [];
  const colors = ['#FFFFFF', '#DDDDDD', '#999999', '#666666'];
  for (let i = 0; i < 80; i++) {
    pieces.push({
      x: canvas.width / 2, y: canvas.height / 2,
      vx: (Math.random() - 0.5) * 16, vy: (Math.random() - 0.5) * 16 - 6,
      size: Math.random() * 8 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360, rotationSpeed: (Math.random() - 0.5) * 10
    });
  }

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let active = false;
    pieces.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.vy += 0.5; p.rotation += p.rotationSpeed;
      if (p.y < canvas.height) active = true;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation * Math.PI / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    });
    if (active) requestAnimationFrame(animate);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  animate();
}

// ==========================================
// DYNAMIC MENU LOGIC
// ==========================================
// Menu categories are free-text staff-editable data, so they can't
// carry a fixed translation key the way app chrome does — but the
// built-in default categories are common enough to translate by
// matching their known English text. Anything staff renames to
// something custom just passes through untranslated.
const CATEGORY_TRANSLATION_MAP = {
  'espresso based': 'catEspressoBased',
  'instant coffee': 'catInstantCoffee',
  'matcha & specialty': 'catMatchaSpecialty',
  'soft drinks': 'catSoftDrinks',
  'warm comfort': 'catWarmComfort'
};
function translateCategoryName(catName) {
  const key = CATEGORY_TRANSLATION_MAP[(catName || '').trim().toLowerCase()];
  return key ? t(key) : catName;
}

// Groups items by category in the admin-defined section order
// (state.menuCategories), instead of "whichever order their first item
// happened to be created in" — that's what made section order
// uncontrollable before. Any item whose category isn't in the known
// list (e.g. a stale/renamed section) still shows, just appended at the
// end sorted alphabetically, so nothing silently disappears. Empty
// sections are dropped — customers should never see a header with
// nothing under it.
function groupMenuItemsByCategory(items) {
  const byName = {};
  items.forEach(item => {
    const cat = item.category || '';
    if (!byName[cat]) byName[cat] = [];
    byName[cat].push(item);
  });

  const known = (state.menuCategories || []).map(c => c.name).filter(name => byName[name]);
  const rest = Object.keys(byName).filter(name => !known.includes(name)).sort();
  return [...known, ...rest].map(name => [name, byName[name]]);
}

// Same idea for the admin editor, except empty sections stay visible
// (as an empty header with reorder/delete controls) — staff need to see
// and manage a section before it has any items in it.
function groupAdminMenuByCategory(items) {
  const byName = {};
  items.forEach(item => {
    const cat = item.category || '';
    if (!byName[cat]) byName[cat] = [];
    byName[cat].push(item);
  });

  const known = (state.menuCategories || []).map(c => c.name);
  const rest = Object.keys(byName).filter(name => !known.includes(name)).sort();
  return [...known, ...rest].map(name => [name, byName[name] || []]);
}

function setMenuPriceView(view) {
  state.menuPriceView = view === 'student' ? 'student' : 'regular';
  if (DOM.menuPriceViewChips) {
    DOM.menuPriceViewChips.forEach(c => {
      c.classList.toggle('active', (c.dataset.priceView || 'regular') === state.menuPriceView);
    });
  }
  renderCustomerMenu();
}

function renderCustomerMenu() {
  if (!DOM.customerMenuContainer) return;
  DOM.customerMenuContainer.innerHTML = '';

  const showStudentPrices = state.menuPriceView === 'student';

  for (const [catName, items] of groupMenuItemsByCategory(state.menuItems)) {
    const catDiv = document.createElement('div');
    catDiv.className = 'menu-category';

    const catTitle = document.createElement('div');
    catTitle.className = 'menu-category-title';
    catTitle.textContent = translateCategoryName(catName);
    catDiv.appendChild(catTitle);

    items.forEach(item => {
      const itemDiv = document.createElement('div');
      itemDiv.className = 'menu-item' + (item.stamps > 0 ? ' stamp-bonus' : '');

      const regularVal = parseFloat(item.price);
      const studentVal = parseFloat(item.studentPrice);
      const hasDiscount = showStudentPrices && item.studentPrice && studentVal > 0 && studentVal < regularVal;

      let priceHtml;
      if (hasDiscount) {
        const pct = Math.round((1 - studentVal / regularVal) * 100);
        priceHtml = `<span class="menu-item-price-original">${regularVal} MKD</span>
                     <span class="menu-item-price">${studentVal} MKD</span>
                     <span class="menu-discount-badge">-${pct}%</span>`;
      } else {
        priceHtml = `<span class="menu-item-price">${regularVal} MKD</span>`;
      }

      let html = `<span class="menu-item-name">${item.name}</span>
                  <span class="menu-item-sub">${item.sub || ''}</span>
                  <span class="menu-item-price-group">${priceHtml}`;

      if (item.stamps > 0) {
        html += ` <span class="menu-bonus-chip">+${item.stamps} stamps</span>`;
      }
      html += `</span>`;

      itemDiv.innerHTML = html;
      catDiv.appendChild(itemDiv);
    });

    DOM.customerMenuContainer.appendChild(catDiv);
  }

  const note = document.createElement('div');
  note.className = 'menu-stamp-note';
  note.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M17 8h1a4 4 0 1 1 0 8h-1M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8z"></path>
      <line x1="6" y1="2" x2="6" y2="4"></line>
      <line x1="10" y1="2" x2="10" y2="4"></line>
      <line x1="14" y1="2" x2="14" y2="4"></line>
    </svg>
    <div class="menu-stamp-note-content">
      <div class="menu-stamp-note-title">${t('menuBonusNoteTitle')}</div>
      <div class="menu-stamp-note-body">${t('menuBonusNoteBody')}</div>
    </div>
  `;
  DOM.customerMenuContainer.appendChild(note);
}

// SAFE DOM CONSTRUCTION FOR STORED XSS PREVENTION
async function renderLeaderboard() {
  if (!DOM.leaderboardContainer) return;
  const loadToken = (state._lbLoadToken = (state._lbLoadToken || 0) + 1);
  DOM.leaderboardContainer.innerHTML = '<div class="lb-loading">···</div>';

  const period = state.leaderboardPeriod || 'all';
  if (DOM.leaderboardSubtitle) {
    DOM.leaderboardSubtitle.textContent = t(period === 'month' ? 'leaderboardSubtitleMonthly' : 'leaderboardSubtitle');
  }

  const [list, myRank] = await Promise.all([
    cloud.getLeaderboard(20, period),
    state.myCustomerId ? cloud.getMyRank(state.myCustomerId, period) : Promise.resolve(null)
  ]);

  if (loadToken !== state._lbLoadToken) return;
  DOM.leaderboardContainer.innerHTML = '';

  // "Your Rank" pinned card
  const myCard = document.createElement('div');
  myCard.className = 'lb-your-rank';
  if (myRank && myRank.totalStampsEarned > 0) {
    // Badge tiers (10/50/100/250) are calibrated for lifetime totals — on
    // a monthly count they'd either never show or misleadingly award a
    // "Mayor of Eightysix°"-tier badge for one good month, so they only
    // make sense in the All Time view.
    const badge = period === 'all' ? getEarnedBadge(myRank.totalStampsEarned) : null;

    const label = document.createElement('div');
    label.className = 'lb-your-rank-label';
    label.textContent = t('leaderboardYourRank');
    myCard.appendChild(label);

    const row = document.createElement('div');
    row.className = 'lb-your-rank-row';

    const pos = document.createElement('div');
    pos.className = 'lb-your-rank-position';
    pos.textContent = `#${myRank.rank}`;
    row.appendChild(pos);

    const info = document.createElement('div');
    info.className = 'lb-your-rank-info';

    const stamps = document.createElement('div');
    stamps.className = 'lb-your-rank-stamps';
    stamps.textContent = `${myRank.totalStampsEarned} ${t('lifetimeStampsShort') || ''}`;
    info.appendChild(stamps);

    if (badge) {
      const badgeEl = document.createElement('div');
      badgeEl.className = 'lb-your-rank-badge';
      badgeEl.textContent = t('badge_' + badge.key);
      info.appendChild(badgeEl);
    }

    row.appendChild(info);
    myCard.appendChild(row);
  } else {
    const empty = document.createElement('div');
    empty.className = 'lb-your-rank-empty';
    empty.textContent = t('leaderboardNotRanked');
    myCard.appendChild(empty);
  }
  DOM.leaderboardContainer.appendChild(myCard);

  if (!list.length) {
    const emptyState = document.createElement('div');
    emptyState.className = 'lb-empty-state';
    emptyState.textContent = t('leaderboardEmpty');
    DOM.leaderboardContainer.appendChild(emptyState);
    return;
  }

  const listEl = document.createElement('div');
  listEl.className = 'lb-list';

  list.forEach((entry, idx) => {
    const rank = idx + 1;
    const row = document.createElement('div');
    row.className = 'lb-row' + (rank <= 3 ? ` lb-top lb-top-${rank}` : '');
    if (myRank && rank === myRank.rank) row.classList.add('lb-is-me');

    const rankEl = document.createElement('div');
    if (rank <= 3) {
      rankEl.className = 'lb-medal';
      rankEl.textContent = rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉';
    } else {
      rankEl.className = 'lb-rank-num';
      rankEl.textContent = rank;
    }
    row.appendChild(rankEl);

    const avatar = document.createElement('div');
    avatar.className = 'lb-avatar';
    avatar.innerHTML = MONOCHROME_AVATARS[entry.avatar] || MONOCHROME_AVATARS.person;
    row.appendChild(avatar);

    const info = document.createElement('div');
    info.className = 'lb-info';

    const nameEl = document.createElement('div');
    nameEl.className = 'lb-name';
    nameEl.textContent = entry.name;
    info.appendChild(nameEl);

    const badge = period === 'all' ? getEarnedBadge(entry.totalStampsEarned) : null;
    if (badge) {
      const badgeEl = document.createElement('div');
      badgeEl.className = 'lb-badge-label';
      badgeEl.textContent = t('badge_' + badge.key);
      info.appendChild(badgeEl);
    }
    row.appendChild(info);

    const stampsEl = document.createElement('div');
    stampsEl.className = 'lb-stamps';
    stampsEl.textContent = entry.totalStampsEarned;
    row.appendChild(stampsEl);

    listEl.appendChild(row);
  });

  DOM.leaderboardContainer.appendChild(listEl);
}

const ICON_CHEVRON_UP = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>';
const ICON_CHEVRON_DOWN = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
const ICON_TRASH_SM = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';

function renderAdminMenu() {
  if (!DOM.adminMenuContainer) return;
  DOM.adminMenuContainer.innerHTML = '';

  const grouped = groupAdminMenuByCategory(state.menuItems);
  const orderedNames = grouped.map(([name]) => name);

  grouped.forEach(([catName, items], index) => {
    const catDiv = document.createElement('div');
    catDiv.className = 'menu-category';

    const header = document.createElement('div');
    header.className = 'menu-category-header';

    const catTitle = document.createElement('div');
    catTitle.className = 'menu-category-title';
    catTitle.textContent = catName + (items.length === 0 ? ` (${t('menuSectionEmpty')})` : '');
    header.appendChild(catTitle);

    const controls = document.createElement('div');
    controls.className = 'menu-category-controls';

    const btnUp = document.createElement('button');
    btnUp.className = 'menu-section-btn';
    btnUp.type = 'button';
    btnUp.setAttribute('aria-label', 'Move section up');
    btnUp.innerHTML = ICON_CHEVRON_UP;
    btnUp.disabled = index === 0;
    btnUp.addEventListener('click', () => reorderMenuCategory(orderedNames, catName, -1));
    controls.appendChild(btnUp);

    const btnDown = document.createElement('button');
    btnDown.className = 'menu-section-btn';
    btnDown.type = 'button';
    btnDown.setAttribute('aria-label', 'Move section down');
    btnDown.innerHTML = ICON_CHEVRON_DOWN;
    btnDown.disabled = index === grouped.length - 1;
    btnDown.addEventListener('click', () => reorderMenuCategory(orderedNames, catName, 1));
    controls.appendChild(btnDown);

    if (items.length === 0) {
      const btnDelete = document.createElement('button');
      btnDelete.className = 'menu-section-btn menu-section-btn-danger';
      btnDelete.type = 'button';
      btnDelete.setAttribute('aria-label', 'Delete section');
      btnDelete.innerHTML = ICON_TRASH_SM;
      btnDelete.addEventListener('click', () => deleteMenuCategory(catName));
      controls.appendChild(btnDelete);
    }

    header.appendChild(controls);
    catDiv.appendChild(header);

    items.forEach(item => {
      const itemDiv = document.createElement('div');
      itemDiv.className = 'menu-item';
      itemDiv.style.cursor = 'pointer';

      const priceVal = parseFloat(item.price).toString();

      let html = `<span class="menu-item-name">${item.name} <span style="font-size: 10px; color: var(--text-muted);">✎ Edit</span></span>
                  <span class="menu-item-price">${priceVal} MKD</span>`;

      itemDiv.innerHTML = html;
      itemDiv.addEventListener('click', () => openMenuModal(item));
      catDiv.appendChild(itemDiv);
    });

    DOM.adminMenuContainer.appendChild(catDiv);
  });
}

// Optimistically reorders locally so the UI responds instantly, then
// persists the full new order — realtime will also echo it back to
// every other open device momentarily.
async function reorderMenuCategory(orderedNames, name, direction) {
  const i = orderedNames.indexOf(name);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= orderedNames.length) return;
  const newOrder = orderedNames.slice();
  [newOrder[i], newOrder[j]] = [newOrder[j], newOrder[i]];

  state.menuCategories = newOrder.map((n, idx) => ({ name: n, sortOrder: idx }));
  renderAdminMenu();
  renderCustomerMenu();

  const ok = await cloud.staffReorderCategories(state.staffToken, newOrder);
  if (!ok) showToast(t('errServerConnection'), 'error');
}

async function deleteMenuCategory(name) {
  const ok = await cloud.staffDeleteCategory(state.staffToken, name);
  if (!ok) {
    showToast(t('errServerConnection'), 'error');
    return;
  }
  await syncMenuFromCloud();
  showToast(t('menuSectionDeleted'), 'success');
}

function openMenuModal(item = null) {
  if (item) {
    DOM.menuModalTitle.textContent = t('menuModalEditItem');
    DOM.menuItemId.value = item.id;
    DOM.menuItemName.value = item.name;
    populateMenuCategorySelect(item.category);
    DOM.menuItemSub.value = item.sub || '';
    DOM.menuItemPrice.value = item.price;
    DOM.menuItemStamps.value = item.stamps || 0;
    if (DOM.menuItemStudentPrice) DOM.menuItemStudentPrice.value = item.studentPrice || '';
    DOM.btnDeleteMenuItem.style.display = 'block';
  } else {
    DOM.menuModalTitle.textContent = t('menuModalAddItem');
    DOM.menuItemId.value = '';
    DOM.menuItemName.value = '';
    populateMenuCategorySelect(null);
    DOM.menuItemSub.value = '';
    DOM.menuItemPrice.value = '';
    DOM.menuItemStamps.value = 0;
    if (DOM.menuItemStudentPrice) DOM.menuItemStudentPrice.value = '';
    DOM.btnDeleteMenuItem.style.display = 'none';
  }
  updateMenuItemDiscountPreview();
  openModal(DOM.modalEditMenuItem);
}

// Populates the Category <select> from the admin-managed section list,
// plus a trailing "+ Add New Section" option that reveals a text input
// right in the item editor — so a brand new section can be created in
// the same flow as adding an item, not as a separate detour.
function populateMenuCategorySelect(selectedName) {
  if (!DOM.menuItemCategory) return;
  const names = (state.menuCategories || []).map(c => c.name);
  if (selectedName && !names.includes(selectedName)) names.push(selectedName);

  DOM.menuItemCategory.innerHTML = names
    .map(name => `<option value="${name}">${name}</option>`)
    .join('') + `<option value="__new__">${t('menuNewSectionOption')}</option>`;

  DOM.menuItemCategory.value = (selectedName && names.includes(selectedName)) ? selectedName : (names[0] || '__new__');

  if (DOM.menuItemCategoryNew) {
    DOM.menuItemCategoryNew.classList.add('hidden');
    DOM.menuItemCategoryNew.value = '';
  }
}

// Live "-X%" preview under the Student Price field as the admin types,
// computed from the two prices rather than asking them to work out a
// percentage themselves.
function updateMenuItemDiscountPreview() {
  if (!DOM.menuItemDiscountPreview) return;
  const price = parseFloat(DOM.menuItemPrice.value);
  const studentPrice = parseFloat(DOM.menuItemStudentPrice.value);
  if (!price || !studentPrice || studentPrice >= price) {
    DOM.menuItemDiscountPreview.textContent = '';
    return;
  }
  const pct = Math.round((1 - studentPrice / price) * 100);
  DOM.menuItemDiscountPreview.textContent = t('menuItemDiscountPreview', { n: pct });
}

if (DOM.btnAddMenuItem) DOM.btnAddMenuItem.addEventListener('click', () => openMenuModal());
if (DOM.btnCancelMenuItem) DOM.btnCancelMenuItem.addEventListener('click', () => closeModal(DOM.modalEditMenuItem));
if (DOM.overlayEditMenuItem) DOM.overlayEditMenuItem.addEventListener('click', () => closeModal(DOM.modalEditMenuItem));
if (DOM.menuItemPrice) DOM.menuItemPrice.addEventListener('input', updateMenuItemDiscountPreview);
if (DOM.menuItemStudentPrice) DOM.menuItemStudentPrice.addEventListener('input', updateMenuItemDiscountPreview);
if (DOM.menuItemCategory && DOM.menuItemCategoryNew) {
  DOM.menuItemCategory.addEventListener('change', () => {
    const isNew = DOM.menuItemCategory.value === '__new__';
    DOM.menuItemCategoryNew.classList.toggle('hidden', !isNew);
    if (isNew) DOM.menuItemCategoryNew.focus();
  });
}

if (DOM.btnSaveMenuItem) {
  DOM.btnSaveMenuItem.addEventListener('click', async () => {
    const id = DOM.menuItemId.value || 'm' + Date.now();
    const name = DOM.menuItemName.value.trim();
    const price = DOM.menuItemPrice.value.trim();

    const creatingNewSection = DOM.menuItemCategory.value === '__new__';
    const newSectionName = creatingNewSection && DOM.menuItemCategoryNew ? DOM.menuItemCategoryNew.value.trim() : '';
    const category = creatingNewSection ? newSectionName : DOM.menuItemCategory.value.trim();

    if (!name || !category || !price) {
      showToast(creatingNewSection ? t('errSectionNameRequired') : 'Name, Category, and Price are required', 'error');
      return;
    }

    const studentPriceRaw = DOM.menuItemStudentPrice ? DOM.menuItemStudentPrice.value.trim() : '';
    const newItem = {
      id,
      name,
      category,
      sub: DOM.menuItemSub.value.trim(),
      price: parseFloat(price).toFixed(2),
      stamps: parseInt(DOM.menuItemStamps.value) || 0,
      studentPrice: studentPriceRaw ? parseFloat(studentPriceRaw).toFixed(2) : ''
    };

    DOM.btnSaveMenuItem.disabled = true;

    if (creatingNewSection) {
      const catResult = await cloud.staffUpsertCategory(state.staffToken, null, newSectionName, null);
      if (catResult.error) {
        DOM.btnSaveMenuItem.disabled = false;
        showToast(t('errServerConnection'), 'error');
        return;
      }
    }

    const result = await cloud.staffUpsertMenuItem(state.staffToken, newItem);
    DOM.btnSaveMenuItem.disabled = false;

    if (result.error) {
      showToast(t('errServerConnection'), 'error');
      return;
    }

    // Server is authoritative — realtime will also push this to every
    // other open device momentarily, this just avoids waiting on it here.
    await syncMenuFromCloud();
    closeModal(DOM.modalEditMenuItem);
    showToast('Menu item saved', 'success');
  });
}

if (DOM.btnDeleteMenuItem) {
  DOM.btnDeleteMenuItem.addEventListener('click', async () => {
    const id = DOM.menuItemId.value;
    if (!id) return;

    DOM.btnDeleteMenuItem.disabled = true;
    const ok = await cloud.staffDeleteMenuItem(state.staffToken, id);
    DOM.btnDeleteMenuItem.disabled = false;

    if (!ok) {
      showToast(t('errServerConnection'), 'error');
      return;
    }

    await syncMenuFromCloud();
    closeModal(DOM.modalEditMenuItem);
    showToast('Menu item deleted', 'success');
  });
}

// ==========================================
// BOOTSTRAP
// ==========================================
document.addEventListener('DOMContentLoaded', initApp);
