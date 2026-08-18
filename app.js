/**
 * 86° PUNCHCARD — Application Logic
 * Vanilla JS with Supabase Realtime & Security Hardening
 */

// ==========================================
// CONFIGURATION & CONSTANTS
// ==========================================
const MAX_STAMPS = 10;
const REGULARS_MIN_STAMPS = 30;
const DB_NAME = '86_punchcard_db';
const DB_VERSION = 1;
const INTEGRITY_SALT = '86_DEGREES_MONOCHROME_SALT_2026';

// Supabase Cloud Configuration
const SUPABASE_URL = 'https://edunsrtcdhnpbsipalhc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_eBMuMX2di-IB74UsVk9rTQ_lcvNyPCv';

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
    errPasswordMinLength: "Password must be at least 6 characters",
    errPasswordWeak: "Password must be 8+ characters with an uppercase letter, a lowercase letter, and a number",
    errUsernameTaken: "That username is taken. Wrong password? Use \"Find My Card\" to log in.",
    errInvalidSignupInput: "Please enter a username and a stronger password",
    errServerConnection: "Could not reach the server. Check your connection and try again.",
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
    splashTagline: "Loyalty",
    rewardTitle: "FREE COFFEE UNLOCKED",
    rewardSubtitle: "You collected 10 stamps! Show your barista to redeem or save it to your wallet for later.",
    btnRedeemNow: "Redeem Now at Counter",
    btnKeepWallet: "Keep in Wallet & Reset Card",
    staffAccessTitle: "Staff Access",
    staffAccessSubtitle: "Enter PIN to access staff features.",
    labelName: "Name",
    labelCategory: "Category",
    labelSubtext: "Subtext (Optional)",
    labelPrice: "Price",
    labelBonusStamps: "Bonus Stamps",
    btnDelete: "Delete",
    btnSave: "Save",
    settingsChangeUsername: "Username",
    setUsernameTitle: "Username",
    setUsernameSubtitle: "Lets you log in without Google, too.",
    toastUsernameSaved: "Username saved!",
    settingsChangeDisplayName: "Display Name",
    setDisplayNameTitle: "Display Name",
    setDisplayNameSubtitle: "The name shown on your card. Changeable once every 14 days.",
    toastDisplayNameSaved: "Display name saved!",
    homeGreetingGuest: "Hi, Guest",
    hiName: "Hi, {name}",
    homeSubtitleGuest: "Please sign in or ask staff to create a card.",
    homeSubtitleRewardReady: "★ Reward Ready for Redemption",
    progressMsgRewardReady: "Reward earned! Show barista to redeem.",
    homeSubtitleDigital: "Digital Punchcard",
    progressMsgStampsNeeded: "{n} more to your free coffee!",
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
    errPasswordMinLength: "Лозинката мора да има најмалку 6 карактери",
    errPasswordWeak: "Лозинката мора да има 8+ карактери, голема буква, мала буква и број",
    errUsernameTaken: "Тоа корисничко име е зафатено. Погрешна лозинка? Користете „Најди ја мојата картичка“ за да се најавите.",
    errInvalidSignupInput: "Внесете корисничко име и посилна лозинка",
    errServerConnection: "Не може да се поврземе со серверот. Проверете ја вашата врска и обидете се повторно.",
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
    splashTagline: "Лојалност",
    rewardTitle: "БЕСПЛАТНО КАФЕ ОТКЛУЧЕНО",
    rewardSubtitle: "Собравте 10 печати! Прикажете му на бариста за да го искористите или зачувајте го во вашиот паричник за подоцна.",
    btnRedeemNow: "Искористи сега на шанкот",
    btnKeepWallet: "Зачувај во паричник и ресетирај картичка",
    staffAccessTitle: "Пристап за вработени",
    staffAccessSubtitle: "Внесете ПИН за пристап до опциите за вработени.",
    labelName: "Име",
    labelCategory: "Категорија",
    labelSubtext: "Поднаслов (опционално)",
    labelPrice: "Цена",
    labelBonusStamps: "Бонус печати",
    btnDelete: "Избриши",
    btnSave: "Зачувај",
    settingsChangeUsername: "Корисничко име",
    setUsernameTitle: "Корисничко име",
    setUsernameSubtitle: "Ви овозможува да се најавите и без Google.",
    toastUsernameSaved: "Корисничкото име е зачувано!",
    settingsChangeDisplayName: "Име за прикажување",
    setDisplayNameTitle: "Име за прикажување",
    setDisplayNameSubtitle: "Името прикажано на вашата картичка. Може да се менува секои 14 дена.",
    toastDisplayNameSaved: "Името е зачувано!",
    homeGreetingGuest: "Здраво, Гостин",
    hiName: "Здраво, {name}",
    homeSubtitleGuest: "Најавете се или замолете вработен да направи картичка.",
    homeSubtitleRewardReady: "★ Наградата е спремна за искористување",
    progressMsgRewardReady: "Наградата е освоена! Прикажете му на бариста за да ја искористите.",
    homeSubtitleDigital: "Дигитална картичка за лојалност",
    progressMsgStampsNeeded: "Уште {n} до бесплатно кафе!",
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
    errPasswordMinLength: "Fjalëkalimi duhet të ketë të paktën 6 karaktere",
    errPasswordWeak: "Fjalëkalimi duhet të ketë 8+ shkronja, një shkronjë të madhe, një të vogël dhe një numër",
    errUsernameTaken: "Ky emër përdoruesi është i zënë. Fjalëkalim i gabuar? Përdor \"Gjej Kartën Time\" për t'u identifikuar.",
    errInvalidSignupInput: "Vendos një emër përdoruesi dhe një fjalëkalim më të fortë",
    errServerConnection: "Nuk mund të lidhemi me serverin. Kontrollo lidhjen dhe provo përsëri.",
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
    splashTagline: "Besnikëri",
    rewardTitle: "KAFE FALAS U ZHBLLOKUA",
    rewardSubtitle: "Mblodhe 10 vula! Tregoja baristës për ta shfrytëzuar ose ruaje në portofolin tënd për më vonë.",
    btnRedeemNow: "Shfrytëzo Tani te Banaku",
    btnKeepWallet: "Ruaje në Portofol & Rivendos Kartën",
    staffAccessTitle: "Qasja e Stafit",
    staffAccessSubtitle: "Vendos PIN-in për të hyrë në veçoritë e stafit.",
    labelName: "Emri",
    labelCategory: "Kategoria",
    labelSubtext: "Nëntitulli (Opsional)",
    labelPrice: "Çmimi",
    labelBonusStamps: "Vula Bonus",
    btnDelete: "Fshi",
    btnSave: "Ruaj",
    settingsChangeUsername: "Emri i Përdoruesit",
    setUsernameTitle: "Emri i Përdoruesit",
    setUsernameSubtitle: "Të lejon të identifikohesh edhe pa Google.",
    toastUsernameSaved: "Emri i përdoruesit u ruajt!",
    settingsChangeDisplayName: "Emri i Shfaqur",
    setDisplayNameTitle: "Emri i Shfaqur",
    setDisplayNameSubtitle: "Emri i shfaqur në kartën tuaj. Ndryshueshëm një herë në 14 ditë.",
    toastDisplayNameSaved: "Emri u ruajt!",
    homeGreetingGuest: "Përshëndetje, Mysafir",
    hiName: "Përshëndetje, {name}",
    homeSubtitleGuest: "Identifikohu ose kërko stafit të krijojë një kartë.",
    homeSubtitleRewardReady: "★ Shpërblimi Gati për t'u Shfrytëzuar",
    progressMsgRewardReady: "Shpërblimi u fitua! Tregoja baristës për ta shfrytëzuar.",
    homeSubtitleDigital: "Karta Dixhitale e Besnikërisë",
    progressMsgStampsNeeded: "Edhe {n} deri te kafeja falas!",
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
  pinFailedAttempts: 0,
  pinLockoutUntil: 0,
  activityFilter: 'all', // 'all' | 'redemption' | 'stamp'
  customerSort: 'recent', // 'recent' | 'regulars'
  editingCustomerId: null,
  campaign: null, // { active, multiplier, label } once fetched
  stats: {
    stampsToday: 0,
    rewardsGiven: 0,
    activeCards: 0
  },
  menuItems: []
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
  const cloudMenu = await cloud.getMenu();
  if (!cloudMenu) return;
  state.menuItems = cloudMenu.length ? cloudMenu : defaultMenu;
  saveMenu();
  renderCustomerMenu();
  renderAdminMenu();
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
    rewardBankedAt: d.reward_banked_at || null
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
        return { error: 'unknown' };
      }
      if (!res.data || !res.data.length) return { error: 'unknown' };
      return { customer: mapDbRowToCustomer(res.data[0]) };
    } catch (e) {
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
        return { error: 'unknown' };
      }
      if (!res.data || !res.data.length) return { error: 'unknown' };
      return { customer: mapDbRowToCustomer(res.data[0]) };
    } catch (e) {
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
        4000
      );
      if (res.error || !res.data || !res.data.length) return null;
      return mapDbRowToCustomer(res.data[0]);
    } catch (e) {
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
        return { error: 'unknown' };
      }
      if (!res.data || !res.data.length) return { error: 'unknown' };
      const d = res.data[0];
      return { customer: mapDbRowToCustomer(d), isNew: d.is_new, token: d.token };
    } catch (e) {
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
      return null;
    }
  },

  // Narrow, single-purpose write — only ever touches phone/username, so
  // it can't clobber stamps/history the way re-sending a full customer
  // record could if the local copy is stale (see
  // supabase-customer-set-username.sql for why this is separate from
  // customer_save_self).
  async setUsername(token, username) {
    if (!supabaseClient) return { error: 'offline' };
    try {
      const res = await withTimeout(
        supabaseClient.rpc('customer_set_username', { p_token: token || null, p_username: username }),
        4000
      );
      if (res.error) {
        const msg = res.error.message || '';
        if (msg.includes('username_taken')) return { error: 'username_taken' };
        if (msg.includes('invalid_input')) return { error: 'invalid_input' };
        return { error: 'unknown' };
      }
      if (!res.data || !res.data.length) return { error: 'unknown' };
      return { customer: mapDbRowToCustomer(res.data[0]) };
    } catch (e) {
      return { error: 'offline' };
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
        if (msg.includes('invalid_input')) return { error: 'invalid_input' };
        return { error: 'unknown' };
      }
      if (!res.data || !res.data.length) return { error: 'unknown' };
      return { customer: mapDbRowToCustomer(res.data[0]) };
    } catch (e) {
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
        options: { redirectTo: window.location.origin + window.location.pathname }
      });
      if (error) return { error: 'offline' };
      return { ok: true };
    } catch (e) {
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
      return null;
    }
  },

  // ---- Staff-attributed writes ----
  async staffAddStamp(token, customerId, baseStamps, drinkName) {
    if (!supabaseClient || !token) return null;
    try {
      const res = await withTimeout(
        supabaseClient.rpc('staff_add_stamp', { p_token: token, p_customer_id: customerId, p_base_stamps: baseStamps, p_drink_name: drinkName }),
        4000
      );
      if (res.error) {
        // Customer exists locally (e.g. a QR scan whose staff_create_customer
        // call failed earlier and silently fell back to a local-only record)
        // but was never actually created server-side. Recreate it from the
        // local copy and retry once, instead of surfacing a "check your
        // connection" error for what's really a stale local record.
        if (String(res.error.message || '').includes('customer_not_found')) {
          const local = await db.getCustomer(customerId);
          const created = await this.staffCreateCustomer(token, customerId, local ? local.name : 'Customer', local ? local.phone : '');
          if (!created) return null;
          const retry = await withTimeout(
            supabaseClient.rpc('staff_add_stamp', { p_token: token, p_customer_id: customerId, p_base_stamps: baseStamps, p_drink_name: drinkName }),
            4000
          );
          if (retry.error || !retry.data || !retry.data.length) return null;
          return mapDbRowToCustomer(retry.data[0]);
        }
        return null;
      }
      if (!res.data || !res.data.length) return null;
      return mapDbRowToCustomer(res.data[0]);
    } catch (e) {
      return null;
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
        return { error: 'unknown' };
      }
      if (!res.data || !res.data.length) return { error: 'unknown' };
      return { customer: mapDbRowToCustomer(res.data[0]) };
    } catch (e) {
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
        return { error: 'unknown' };
      }
      if (!res.data || !res.data.length) return { error: 'unknown' };
      return { customer: mapDbRowToCustomer(res.data[0]) };
    } catch (e) {
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
        return { error: 'unknown' };
      }
      return { ok: true };
    } catch (e) {
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
      return res.data.map(d => ({ id: d.id, name: d.name, sub: d.sub || '', price: d.price, category: d.category, stamps: d.stamps || 0 }));
    } catch (e) {
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
          p_stamps: item.stamps || 0
        }),
        4000
      );
      if (res.error || !res.data || !res.data.length) return { error: 'unknown' };
      const d = res.data[0];
      return { item: { id: d.id, name: d.name, sub: d.sub || '', price: d.price, category: d.category, stamps: d.stamps || 0 } };
    } catch (e) {
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

      if (!localCustomer || localCustomer.stamps !== cloudCustomer.stamps || localCustomer.rewardsEarned !== cloudCustomer.rewardsEarned || localCustomer.avatar !== cloudCustomer.avatar) {
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
  viewSplash: document.getElementById('view-splash'),
  viewSignup: document.getElementById('view-signup'),
  viewAdminLogin: document.getElementById('view-admin-login'),
  viewHome: document.getElementById('view-home'),
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
  progressMsg: document.getElementById('progress-msg'),
  adminActions: document.getElementById('admin-actions'),
  btnAddStamp: document.getElementById('btn-add-stamp'),
  punchcard: document.getElementById('punchcard'),
  adminEmptyState: document.getElementById('admin-empty-state'),
  homeGreeting: document.getElementById('home-greeting'),
  homeSubtitle: document.getElementById('home-subtitle'),
  cardNumber: document.getElementById('card-number'),
  stampBadge: document.getElementById('stamp-badge'),
  stampBadgeLabel: document.getElementById('stamp-badge-label'),
  btnShowQr: document.getElementById('btn-show-qr'),
  btnLogoutHeader: document.getElementById('btn-logout-header'),

  // Avatar Picker Elements
  btnChangeAvatar: document.getElementById('btn-change-avatar'),
  btnChangeUsername: document.getElementById('btn-change-username'),
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
  modalSetUsername: document.getElementById('modal-set-username'),
  overlaySetUsername: document.getElementById('overlay-set-username'),
  setUsernameInput: document.getElementById('set-username-input'),
  setUsernameError: document.getElementById('set-username-error'),
  btnSetUsernameSkip: document.getElementById('btn-set-username-skip'),
  btnSetUsernameSave: document.getElementById('btn-set-username-save'),
  btnChangeDisplayName: document.getElementById('btn-change-displayname'),
  modalSetDisplayName: document.getElementById('modal-set-displayname'),
  overlaySetDisplayName: document.getElementById('overlay-set-displayname'),
  setDisplayNameInput: document.getElementById('set-displayname-input'),
  setDisplayNameError: document.getElementById('set-displayname-error'),
  btnSetDisplayNameSkip: document.getElementById('btn-set-displayname-skip'),
  btnSetDisplayNameSave: document.getElementById('btn-set-displayname-save'),
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
  menuItemSub: document.getElementById('menu-item-sub'),
  menuItemPrice: document.getElementById('menu-item-price'),
  menuItemStamps: document.getElementById('menu-item-stamps'),
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
    switchView('view-admin-login');
    return true;
  }
  if (hash === '#poster' || hash === '#/poster') {
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
    renderCustomerMenu();
    renderAdminMenu();
    syncMenuFromCloud();
    cloud.subscribeToMenu();
    // Realtime should push edits instantly, but websockets can silently
    // drop (backgrounded app, flaky connection) without an obvious
    // reconnect — this bounds how stale a displayed price can ever get
    // to well under a minute even if that happens.
    setInterval(syncMenuFromCloud, 45000);

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
    const returningFromOAuth = /[#&](access_token|error)=/.test(window.location.hash);
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
              await supabaseClient.auth.signOut().catch(() => {});
            }
          }
        }
      } catch (e) {}
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
  // its own, so it's active and in control well before this is tapped —
  // reloading is all that's needed to actually re-fetch and re-run the
  // new app.js instead of continuing on the copy already sitting in memory.
  banner.addEventListener('click', () => window.location.reload(), { once: true });
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

function setupEventListeners() {
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

  // Change Username (Settings > Account) — pre-fills with whatever
  // username the customer already has, blank for Google customers who
  // never set one.
  if (DOM.btnChangeUsername) {
    DOM.btnChangeUsername.addEventListener('click', async () => {
      const activeId = state.myCustomerId;
      if (!activeId) return;
      const customer = await db.getCustomer(activeId);
      if (DOM.setUsernameInput) DOM.setUsernameInput.value = (customer && customer.phone) || '';
      if (DOM.setUsernameError) DOM.setUsernameError.textContent = '';
      openModal(DOM.modalSetUsername);
    });
  }

  // Change Display Name (Settings > Account) — separate from the login
  // username above; this is the name shown on the card/QR/leaderboard.
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
    const name = (DOM.signupName ? DOM.signupName.value : '').trim();
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
      const result = await cloud.signupCustomer(username, password, name);

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
  const handleUserLogout = () => {
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
    showToast(t('toastLoggedOut'), 'success');
  };

  if (DOM.btnLogoutHeader) DOM.btnLogoutHeader.addEventListener('click', handleUserLogout);
  if (DOM.btnLogoutUser) DOM.btnLogoutUser.addEventListener('click', handleUserLogout);
  if (DOM.btnStaffLogout) DOM.btnStaffLogout.addEventListener('click', handleUserLogout);

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

      const updated = await cloud.staffAddStamp(state.staffToken, state.selectedCustomerId, baseStamps, drinkName);
      if (!updated) {
        showToast('Could not add stamp — check your connection', 'error');
        return;
      }

      await db.saveCustomer(updated);
      state.customers = await db.getAllCustomers();

      const bankedNew = updated.rewardsEarned > (oldCustomer ? (oldCustomer.rewardsEarned || 0) : 0);
      await updateCardUI();
      if (bankedNew) {
        playRewardSound();
        hapticPulse([30, 40, 30, 40, 60]);
        showToast(`${drinkName}! Reward Banked for Customer! (${updated.rewardsEarned} Available)`, 'success');
      } else {
        playStampSound();
        hapticPulse(25);
        for (let i = oldStamps; i < updated.stamps; i++) {
          const cup = document.getElementById(`stamp-${i}`);
          if (cup) {
            cup.classList.add('earning');
            setTimeout(() => cup.classList.remove('earning'), 600);
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

  // Set/Change Username modal (opened from Settings > Account).
  if (DOM.btnSetUsernameSkip) DOM.btnSetUsernameSkip.addEventListener('click', () => closeModal(DOM.modalSetUsername));
  if (DOM.overlaySetUsername) DOM.overlaySetUsername.addEventListener('click', () => closeModal(DOM.modalSetUsername));
  if (DOM.btnSetUsernameSave) {
    DOM.btnSetUsernameSave.addEventListener('click', async () => {
      const username = (DOM.setUsernameInput ? DOM.setUsernameInput.value : '').trim().toLowerCase();
      if (!username) {
        DOM.setUsernameError.textContent = t('errChooseUsername');
        return;
      }
      if (!state.myCustomerId) {
        closeModal(DOM.modalSetUsername);
        return;
      }

      DOM.btnSetUsernameSave.disabled = true;
      const result = await cloud.setUsername(state.myToken, username);
      DOM.btnSetUsernameSave.disabled = false;

      if (result.error === 'username_taken') {
        DOM.setUsernameError.textContent = t('errUsernameTaken');
        return;
      }
      if (result.error) {
        DOM.setUsernameError.textContent = t('errServerConnection');
        return;
      }

      await db.saveCustomer(result.customer);
      const savedSession = JSON.parse(localStorage.getItem('86_user_session') || 'null');
      if (savedSession && savedSession.id === result.customer.id) {
        savedSession.phone = result.customer.phone;
        localStorage.setItem('86_user_session', JSON.stringify(savedSession));
      }
      closeModal(DOM.modalSetUsername);
      showToast(t('toastUsernameSaved'), 'success');
    });
  }

  if (DOM.btnSetDisplayNameSkip) DOM.btnSetDisplayNameSkip.addEventListener('click', () => closeModal(DOM.modalSetDisplayName));
  if (DOM.overlaySetDisplayName) DOM.overlaySetDisplayName.addEventListener('click', () => closeModal(DOM.modalSetDisplayName));
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
      closeModal(DOM.modalSetDisplayName);
      await updateCardUI();
      showToast(t('toastDisplayNameSaved'), 'success');
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
}

// ==========================================
// UI UPDATES & HELPERS
// ==========================================

function switchView(viewId) {
  state.currentView = viewId;

  DOM.navItems.forEach(item => {
    if (item.dataset.target === viewId) item.classList.add('active');
    else item.classList.remove('active');
  });

  DOM.views.forEach(view => {
    if (view.id === viewId) view.classList.add('active');
    else view.classList.remove('active');
  });

  if (viewId === 'view-poster') {
    if (DOM.nav) DOM.nav.classList.add('hidden');
    renderPosterQr();
  } else if (viewId === 'view-signup' || viewId === 'view-splash' || viewId === 'view-admin-login') {
    if (DOM.nav) DOM.nav.classList.add('hidden');
  } else {
    if (DOM.nav) DOM.nav.classList.remove('hidden');
  }

  if (viewId === 'view-settings') updateSettingsStats();
  if (viewId === 'view-activity') renderActivityList();
  if (viewId === 'view-leaderboard') renderLeaderboard();
  // Prices must be current the moment someone is actually looking at the
  // menu — don't rely solely on realtime having stayed connected since
  // boot (a backgrounded app, a dropped websocket, etc. shouldn't be able
  // to leave a stale price on screen at the moment it matters most).
  if (viewId === 'view-menu' || viewId === 'view-admin-menu') syncMenuFromCloud();

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
    if (DOM.userAvatarDisplay) DOM.userAvatarDisplay.innerHTML = MONOCHROME_AVATARS.person;
    updateGreetingMarquee();
    return;
  }

  const customer = await db.getCustomer(state.selectedCustomerId);
  if (!customer) return;

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

  if (!state.isAdmin) refreshCustomerCampaignBanner();

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
}

function canVoidRedemption(customer) {
  const last = customer && Array.isArray(customer.history) ? customer.history[0] : null;
  return !!(last && last.type === 'redemption' && !last.voided);
}

function updateSettingsStats() {
  if (!state.isAdmin) return;
  renderStaffProfile();

  let stampsToday = 0;
  let rewardsGiven = 0;
  const todayStr = new Date().toISOString().split('T')[0];

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
        if (h.type === 'stamp') {
          const amount = h.stamps || 1;
          if (isToday) stampsToday += amount;
          const s = bump(h.staffName);
          s.total += amount;
          if (isToday) s.today += amount;
        } else if (h.type === 'redemption') {
          if (isToday) {
            rewardsGiven += 1;
            bump(h.staffName).rewardsToday += 1;
          }
        }
      });
    }
  });

  if (DOM.statStampsToday) DOM.statStampsToday.textContent = stampsToday;
  if (DOM.statRewardsGiven) DOM.statRewardsGiven.textContent = rewardsGiven;
  if (DOM.statActiveCards) DOM.statActiveCards.textContent = state.customers.length;

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

function renderCustomerMenu() {
  if (!DOM.customerMenuContainer) return;
  DOM.customerMenuContainer.innerHTML = '';

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

  const categories = {};
  state.menuItems.forEach(item => {
    if (!categories[item.category]) categories[item.category] = [];
    categories[item.category].push(item);
  });

  for (const [catName, items] of Object.entries(categories)) {
    const catDiv = document.createElement('div');
    catDiv.className = 'menu-category';
    
    const catTitle = document.createElement('div');
    catTitle.className = 'menu-category-title';
    catTitle.textContent = translateCategoryName(catName);
    catDiv.appendChild(catTitle);

    items.forEach(item => {
      const itemDiv = document.createElement('div');
      itemDiv.className = 'menu-item' + (item.stamps > 0 ? ' stamp-bonus' : '');
      
      const priceVal = parseFloat(item.price).toString();
      
      let html = `<span class="menu-item-name">${item.name}</span>
                  <span class="menu-item-sub">${item.sub || ''}</span>
                  <span class="menu-item-price">${priceVal} MKD`;
                  
      if (item.stamps > 0) {
        html += ` <span class="menu-bonus-chip">+${item.stamps} stamps</span>`;
      }
      html += `</span>`;
      
      itemDiv.innerHTML = html;
      catDiv.appendChild(itemDiv);
    });
    
    DOM.customerMenuContainer.appendChild(catDiv);
  }
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

function renderAdminMenu() {
  if (!DOM.adminMenuContainer) return;
  DOM.adminMenuContainer.innerHTML = '';
  
  const categories = {};
  state.menuItems.forEach(item => {
    if (!categories[item.category]) categories[item.category] = [];
    categories[item.category].push(item);
  });

  for (const [catName, items] of Object.entries(categories)) {
    const catDiv = document.createElement('div');
    catDiv.className = 'menu-category';
    
    const catTitle = document.createElement('div');
    catTitle.className = 'menu-category-title';
    catTitle.textContent = catName;
    catDiv.appendChild(catTitle);

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
  }
}

function openMenuModal(item = null) {
  if (item) {
    DOM.menuModalTitle.textContent = t('menuModalEditItem');
    DOM.menuItemId.value = item.id;
    DOM.menuItemName.value = item.name;
    DOM.menuItemCategory.value = item.category;
    DOM.menuItemSub.value = item.sub || '';
    DOM.menuItemPrice.value = item.price;
    DOM.menuItemStamps.value = item.stamps || 0;
    DOM.btnDeleteMenuItem.style.display = 'block';
  } else {
    DOM.menuModalTitle.textContent = t('menuModalAddItem');
    DOM.menuItemId.value = '';
    DOM.menuItemName.value = '';
    DOM.menuItemCategory.value = '';
    DOM.menuItemSub.value = '';
    DOM.menuItemPrice.value = '';
    DOM.menuItemStamps.value = 0;
    DOM.btnDeleteMenuItem.style.display = 'none';
  }
  openModal(DOM.modalEditMenuItem);
}

if (DOM.btnAddMenuItem) DOM.btnAddMenuItem.addEventListener('click', () => openMenuModal());
if (DOM.btnCancelMenuItem) DOM.btnCancelMenuItem.addEventListener('click', () => closeModal(DOM.modalEditMenuItem));
if (DOM.overlayEditMenuItem) DOM.overlayEditMenuItem.addEventListener('click', () => closeModal(DOM.modalEditMenuItem));

if (DOM.btnSaveMenuItem) {
  DOM.btnSaveMenuItem.addEventListener('click', async () => {
    const id = DOM.menuItemId.value || 'm' + Date.now();
    const name = DOM.menuItemName.value.trim();
    const category = DOM.menuItemCategory.value.trim();
    const price = DOM.menuItemPrice.value.trim();

    if (!name || !category || !price) {
      showToast('Name, Category, and Price are required', 'error');
      return;
    }

    const newItem = {
      id,
      name,
      category,
      sub: DOM.menuItemSub.value.trim(),
      price: parseFloat(price).toFixed(2),
      stamps: parseInt(DOM.menuItemStamps.value) || 0
    };

    DOM.btnSaveMenuItem.disabled = true;
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
