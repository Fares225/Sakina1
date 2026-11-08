/**
 * سكينة — تطبيق مواقيت الصلاة والمصحف والأذكار (Expo / React Native)
 *
 * الشاشات: المواقيت + القبلة، المصحف، الأذكار، السبحة، المزيد (أسماء الله، الزكاة، الإعدادات).
 * التخزين: AsyncStorage (محلي بالكامل، بدون حسابات).
 * التنبيهات: expo-notifications (محلية ومجدولة، محتاجة development build أو APK).
 *
 * متطلبات app.json:
 *   - plugin expo-notifications مع sounds: ["./assets/sounds/adhan.wav"]
 *   - plugin expo-location + وصف إذن الموقع
 *   - plugin expo-font
 */
import {
  Component,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  Animated,
  AppState,
  BackHandler,
  FlatList,
  I18nManager,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  Vibration,
  View,
  useColorScheme,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import {
  useFonts,
  Cairo_400Regular,
  Cairo_600SemiBold,
  Cairo_800ExtraBold,
} from '@expo-google-fonts/cairo';
import { Amiri_400Regular, Amiri_700Bold } from '@expo-google-fonts/amiri';
import {
  Coordinates,
  CalculationMethod,
  PrayerTimes,
  Madhab,
  Prayer,
  Qibla,
} from 'adhan';

// الاتجاه بنعكسه يدويًا بـ row-reverse، فنقفل RTL التلقائي (محتاج إعادة تشغيل التطبيق أول مرة)
I18nManager.allowRTL(false);
I18nManager.forceRTL(false);

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/* =====================================================
   اسم التطبيق (غيّره لاسمك النهائي)
===================================================== */

const APP_NAME = 'سكينة';
const APP_TAGLINE = 'رفيقك في كل صلاة';

/* =====================================================
   الخطوط
===================================================== */

const F = {
  reg: 'Cairo_400Regular',
  semi: 'Cairo_600SemiBold',
  bold: 'Cairo_800ExtraBold',
  quran: 'Amiri_400Regular',
  quranBold: 'Amiri_700Bold',
};

/* =====================================================
   الثيم (فاتح / داكن)
===================================================== */

const LIGHT = {
  dark: false,
  bg: '#F5F2EA',
  card: '#FFFFFF',
  cardAlt: '#EFEADC',
  text: '#1B2A25',
  sub: '#6B7A73',
  border: '#E8E2D3',
  primary: '#0F5C4A',
  primaryDark: '#0A4436',
  primarySoft: '#DCEBE4',
  onPrimary: '#FFFFFF',
  gold: '#B8913A',
  goldSoft: '#FBF3DD',
  hero: '#0F5C4A',
  heroGrad: ['#0A4436', '#0F5C4A', '#17806A'],
  heroText: '#FFFFFF',
  heroAccent: '#F0CF7A',
  done: '#E3F2EA',
  doneBorder: '#9DCDB4',
};

const DARK = {
  dark: true,
  bg: '#0D1411',
  card: '#16201B',
  cardAlt: '#1F2C25',
  text: '#EAF1ED',
  sub: '#8DA196',
  border: '#243229',
  primary: '#46C196',
  primaryDark: '#2E9C77',
  primarySoft: '#1D3A2F',
  onPrimary: '#06251B',
  gold: '#D8B25A',
  goldSoft: '#2B2514',
  hero: '#14382D',
  heroGrad: ['#0E2A22', '#14382D', '#1C4D3E'],
  heroText: '#FFFFFF',
  heroAccent: '#F0CF7A',
  done: '#1B3A2E',
  doneBorder: '#2F6A52',
};

const Ctx = createContext(null);
const useTheme = () => useContext(Ctx);

const TOP = (Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 44) + 12;
const TAB_SPACE = 120; // مساحة الشريط السفلي العائم

const shadow = (t) =>
  Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOpacity: t.dark ? 0.35 : 0.08,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
    },
    android: { elevation: 3 },
  });

function makeStyles(t) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },
    content: { padding: 16, paddingTop: TOP, paddingBottom: TAB_SPACE },
    center: { alignItems: 'center', justifyContent: 'center' },

    pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },

    header: { marginBottom: 18 },
    headerSmall: {
      fontSize: 13,
      color: t.gold,
      textAlign: 'right',
      fontFamily: F.semi,
    },
    headerTitle: {
      fontSize: 28,
      color: t.text,
      textAlign: 'right',
      marginTop: 2,
      fontFamily: F.bold,
    },

    // ===== نظام الأزرار =====
    btnBase: {
      flexDirection: 'row-reverse',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderRadius: 16,
      paddingVertical: 14,
      paddingHorizontal: 20,
      minHeight: 52,
    },
    btn_primary: {
      backgroundColor: t.primary,
      borderBottomWidth: 3,
      borderBottomColor: t.primaryDark,
      ...shadow(t),
    },
    btn_soft: { backgroundColor: t.primarySoft },
    btn_outline: {
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderColor: t.primary,
    },
    btnPressed: { transform: [{ scale: 0.97 }], opacity: 0.9 },
    btnText: { fontSize: 16, fontFamily: F.bold },
    btnText_primary: { color: t.onPrimary },
    btnText_soft: { color: t.primary },
    btnText_outline: { color: t.primary },
    btnWrap: { marginTop: 4, marginBottom: 16 },

    // شريط التبويبات (عائم)
    tabBar: {
      position: 'absolute',
      left: 14,
      right: 14,
      bottom: Platform.OS === 'ios' ? 24 : 14,
      flexDirection: 'row-reverse',
      backgroundColor: t.card,
      borderRadius: 28,
      borderWidth: 1,
      borderColor: t.border,
      padding: 6,
      ...shadow(t),
    },
    tabItem: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 8,
      marginHorizontal: 2,
      borderRadius: 22,
    },
    tabItemOn: { backgroundColor: t.primarySoft },
    tabLabel: { fontSize: 11, color: t.sub, marginTop: 2, fontFamily: F.semi },
    tabLabelOn: { color: t.primary, fontFamily: F.bold },

    // المواقيت
    heroWrap: {
      borderRadius: 24,
      marginBottom: 16,
      ...shadow(t),
    },
    hero: {
      borderRadius: 24,
      padding: 24,
      alignItems: 'center',
      overflow: 'hidden',
    },
    heroCircleA: {
      position: 'absolute',
      width: 220,
      height: 220,
      borderRadius: 110,
      borderWidth: 1.5,
      borderColor: 'rgba(240,207,122,0.18)',
      top: -80,
      left: -60,
    },
    heroCircleB: {
      position: 'absolute',
      width: 160,
      height: 160,
      borderRadius: 80,
      borderWidth: 1.5,
      borderColor: 'rgba(255,255,255,0.10)',
      bottom: -60,
      right: -40,
    },
    heroTitle: { fontSize: 15, color: t.heroText, opacity: 0.9, fontFamily: F.reg },
    heroPrayer: { fontSize: 32, color: t.heroText, marginTop: 2, fontFamily: F.bold },
    countdown: {
      fontSize: 52,
      marginVertical: 6,
      color: t.heroAccent,
      fontVariant: ['tabular-nums'],
      fontFamily: F.bold,
    },
    heroMeta: {
      fontSize: 12,
      color: t.heroText,
      opacity: 0.75,
      textAlign: 'center',
      marginTop: 3,
      fontFamily: F.reg,
    },
    row: {
      flexDirection: 'row-reverse',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: t.card,
      borderRadius: 16,
      paddingVertical: 12,
      paddingHorizontal: 16,
      marginBottom: 8,
      borderWidth: 1.5,
      borderColor: t.border,
    },
    rowNext: { borderColor: t.gold, backgroundColor: t.goldSoft },
    rowPassed: { opacity: 0.5 },
    rowRight: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
    rowIconWrap: {
      width: 38,
      height: 38,
      borderRadius: 12,
      backgroundColor: t.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowIconWrapNext: { backgroundColor: t.gold },
    label: { fontSize: 17, color: t.text, fontFamily: F.reg },
    bold: { fontFamily: F.bold },
    time: { fontSize: 17, color: t.text, fontFamily: F.semi },
    nextBadge: { fontSize: 11, color: t.gold, marginRight: 6, fontFamily: F.bold },

    card: {
      backgroundColor: t.card,
      borderRadius: 24,
      padding: 20,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: t.border,
      ...shadow(t),
    },
    cardTitle: { fontSize: 18, color: t.text, marginBottom: 16, fontFamily: F.bold },
    compassCircle: {
      width: 220,
      height: 220,
      borderRadius: 110,
      borderWidth: 5,
      borderColor: t.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.cardAlt,
    },
    compassAligned: { borderColor: t.primary, backgroundColor: t.primarySoft },
    kaaba: { fontSize: 36, textAlign: 'center', marginTop: -4 },
    compassHint: { fontSize: 15, marginTop: 16, color: t.text, fontFamily: F.reg },
    compassHintOk: { color: t.primary, fontFamily: F.bold },
    note: { fontSize: 12, color: t.sub, textAlign: 'center', marginTop: 4, fontFamily: F.reg },

    // تتبع الصلوات
    trackerRow: { flexDirection: 'row-reverse', gap: 6 },
    trackerItem: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 12,
      borderRadius: 14,
      backgroundColor: t.cardAlt,
      borderWidth: 1.5,
      borderColor: 'transparent',
    },
    trackerItemOn: { backgroundColor: t.primarySoft, borderColor: t.primary },
    trackerLabel: { fontSize: 12, color: t.sub, marginTop: 4, fontFamily: F.reg },
    trackerLabelOn: { color: t.primary, fontFamily: F.bold },

    // أزرار التبديل
    segment: {
      flexDirection: 'row-reverse',
      backgroundColor: t.cardAlt,
      borderRadius: 16,
      padding: 4,
      marginBottom: 12,
    },
    segBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
    segBtnOn: {
      backgroundColor: t.primary,
      borderBottomWidth: 3,
      borderBottomColor: t.primaryDark,
    },
    segText: { fontSize: 14, color: t.sub, textAlign: 'center', fontFamily: F.reg },
    segTextOn: { color: t.onPrimary, fontFamily: F.bold },

    // الأذكار
    hintText: { fontSize: 12, color: t.sub, textAlign: 'center', marginBottom: 12, fontFamily: F.reg },
    dhikrCard: {
      backgroundColor: t.card,
      borderRadius: 18,
      padding: 18,
      marginBottom: 12,
      borderWidth: 1.5,
      borderColor: t.border,
      borderRightWidth: 5,
      borderRightColor: t.gold,
      ...shadow(t),
    },
    dhikrDone: {
      backgroundColor: t.done,
      borderColor: t.doneBorder,
      borderRightColor: t.primary,
    },
    dhikrText: {
      fontSize: 22,
      lineHeight: 42,
      color: t.text,
      textAlign: 'right',
      fontFamily: F.quran,
    },
    dhikrBadge: { marginTop: 10, fontSize: 13, color: t.sub, textAlign: 'right', fontFamily: F.reg },
    dhikrBadgeDone: { color: t.primary, fontFamily: F.bold },
    dhikrTitle: {
      fontSize: 13,
      color: t.gold,
      textAlign: 'right',
      marginBottom: 6,
      fontFamily: F.semi,
    },

    // السبحة
    tasbeehTitle: {
      fontSize: 32,
      color: t.text,
      textAlign: 'center',
      marginBottom: 12,
      fontFamily: F.quranBold,
    },
    chipsRow: { flexDirection: 'row-reverse', gap: 8, paddingVertical: 4 },
    chipsRowCenter: {
      flexDirection: 'row-reverse',
      justifyContent: 'center',
      gap: 8,
      marginTop: 20,
      marginBottom: 12,
    },
    chip: {
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 22,
      backgroundColor: t.cardAlt,
      borderWidth: 1.5,
      borderColor: 'transparent',
    },
    chipOn: { backgroundColor: t.primary, borderColor: t.primaryDark },
    chipText: { color: t.sub, fontSize: 14, fontFamily: F.reg },
    chipTextOn: { color: t.onPrimary, fontFamily: F.bold },
    tasbeehRing: {
      alignSelf: 'center',
      width: 272,
      height: 272,
      borderRadius: 136,
      borderWidth: 2,
      borderColor: t.gold,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 20,
    },
    tasbeehBtn: {
      width: 244,
      height: 244,
      borderRadius: 122,
      backgroundColor: t.primary,
      borderBottomWidth: 6,
      borderBottomColor: t.primaryDark,
      alignItems: 'center',
      justifyContent: 'center',
      ...shadow(t),
    },
    tasbeehBtnPressed: { transform: [{ scale: 0.96 }], borderBottomWidth: 3 },
    tasbeehCount: { fontSize: 76, color: t.onPrimary, fontFamily: F.bold },
    tasbeehSub: { fontSize: 16, color: t.onPrimary, opacity: 0.75, fontFamily: F.reg },

    // الإعدادات
    sectionTitle: {
      fontSize: 15,
      color: t.gold,
      textAlign: 'right',
      marginTop: 18,
      marginBottom: 8,
      fontFamily: F.bold,
    },
    optionRow: {
      flexDirection: 'row-reverse',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: t.card,
      borderRadius: 14,
      padding: 14,
      marginBottom: 6,
      borderWidth: 1.5,
      borderColor: t.border,
    },
    optionRowOn: { borderColor: t.primary, backgroundColor: t.primarySoft },
    optionText: { fontSize: 16, color: t.text, fontFamily: F.reg },
    optionTextOn: { color: t.primary, fontFamily: F.bold },
    optionMark: { fontSize: 16, color: t.primary, fontFamily: F.reg },
    switchRow: {
      flexDirection: 'row-reverse',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: t.card,
      borderRadius: 14,
      padding: 14,
      marginBottom: 12,
      borderWidth: 1.5,
      borderColor: t.border,
    },

    // المصحف
    input: {
      backgroundColor: t.card,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: t.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      color: t.text,
      textAlign: 'right',
      marginBottom: 12,
      fontFamily: F.reg,
    },
    surahRow: {
      flexDirection: 'row-reverse',
      alignItems: 'center',
      backgroundColor: t.card,
      borderRadius: 16,
      padding: 14,
      marginBottom: 8,
      borderWidth: 1.5,
      borderColor: t.border,
      gap: 12,
    },
    surahNum: {
      width: 42,
      height: 42,
      borderRadius: 13,
      backgroundColor: t.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    surahNumText: { color: t.primary, fontSize: 15, fontFamily: F.bold },
    surahInfo: { flex: 1 },
    surahName: { fontSize: 20, color: t.text, textAlign: 'right', fontFamily: F.semi },
    surahMeta: { fontSize: 12, color: t.sub, textAlign: 'right', marginTop: 2, fontFamily: F.reg },
    surahEn: { fontSize: 12, color: t.sub, fontFamily: F.reg },
    progressTrack: {
      height: 6,
      borderRadius: 3,
      backgroundColor: t.cardAlt,
      overflow: 'hidden',
      marginTop: 8,
    },
    progressFill: { height: 6, backgroundColor: t.primary },

    readerBar: {
      flexDirection: 'row-reverse',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: TOP,
      paddingBottom: 10,
      backgroundColor: t.bg,
      borderBottomWidth: 1,
      borderBottomColor: t.border,
    },
    pill: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: t.cardAlt,
    },
    pillText: { color: t.primary, fontSize: 14, fontFamily: F.bold },
    readerTitle: { fontSize: 22, color: t.text, fontFamily: F.quranBold },
    fontCtl: { flexDirection: 'row-reverse', gap: 8 },
    bismillah: {
      fontSize: 32,
      color: t.gold,
      textAlign: 'center',
      paddingVertical: 18,
      fontFamily: F.quranBold,
    },
    ayahRow: {
      paddingHorizontal: 18,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.border,
    },
    ayahMarked: { backgroundColor: t.goldSoft },
    ayahText: {
      color: t.text,
      textAlign: 'right',
      writingDirection: 'rtl',
      fontFamily: F.quran,
    },
    ayahNum: { color: t.gold, fontFamily: F.quranBold },
    ayahMark: { position: 'absolute', left: 10, top: 8 },
  });
}

/* =====================================================
   مكونات مشتركة
===================================================== */

function Header({ small, title }) {
  const { s } = useTheme();
  return (
    <View style={s.header}>
      <Text style={s.headerSmall}>{small}</Text>
      <Text style={s.headerTitle}>{title}</Text>
    </View>
  );
}

// icon = اسم أيقونة من Ionicons
function Button({ title, icon, onPress, variant = 'primary', style }) {
  const { s, t } = useTheme();
  const iconColor = variant === 'primary' ? t.onPrimary : t.primary;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        s.btnBase,
        s[`btn_${variant}`],
        pressed && s.btnPressed,
        style,
      ]}
    >
      {icon ? <Ionicons name={icon} size={20} color={iconColor} /> : null}
      <Text style={[s.btnText, s[`btnText_${variant}`]]}>{title}</Text>
    </Pressable>
  );
}

/* =====================================================
   التخزين المحلي
===================================================== */

async function load(key, fallback) {
  try {
    const v = await AsyncStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch (e) {
    return fallback;
  }
}

async function save(key, value) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (e) {}
}

function todayKey(d = new Date()) {
  const two = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

const toArabicDigits = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);

/* =====================================================
   التاريخ الهجري
===================================================== */

const HIJRI_MONTHS = [
  'محرم',
  'صفر',
  'ربيع الأول',
  'ربيع الآخر',
  'جمادى الأولى',
  'جمادى الآخرة',
  'رجب',
  'شعبان',
  'رمضان',
  'شوال',
  'ذو القعدة',
  'ذو الحجة',
];

function gregorianToHijri(date) {
  const d = date.getDate();
  let m = date.getMonth() + 1;
  let y = date.getFullYear();
  if (m < 3) {
    y -= 1;
    m += 12;
  }
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  const jd =
    Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + b - 1524;

  let l = jd - 1948440 + 10632;
  const n = Math.floor((l - 1) / 10631);
  l = l - 10631 * n + 354;
  const j =
    Math.floor((10985 - l) / 5316) * Math.floor((50 * l) / 17719) +
    Math.floor(l / 5670) * Math.floor((43 * l) / 15238);
  l =
    l -
    Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) -
    Math.floor(j / 16) * Math.floor((15238 * j) / 43) +
    29;
  const month = Math.floor((24 * l) / 709);
  const day = l - Math.floor((709 * month) / 24);
  const year = 30 * n + j - 30;
  return { year, month, day };
}

function formatHijri(date) {
  const h = gregorianToHijri(date);
  return `${toArabicDigits(h.day)} ${HIJRI_MONTHS[h.month - 1]} ${toArabicDigits(h.year)} هـ`;
}

/* =====================================================
   الإعدادات
===================================================== */

const METHODS = [
  ['Egyptian', 'الهيئة المصرية العامة للمساحة'],
  ['MuslimWorldLeague', 'رابطة العالم الإسلامي'],
  ['UmmAlQura', 'أم القرى (مكة المكرمة)'],
  ['Karachi', 'جامعة العلوم الإسلامية بكراتشي'],
  ['Kuwait', 'الكويت'],
  ['Qatar', 'قطر'],
  ['NorthAmerica', 'أمريكا الشمالية (ISNA)'],
];

const DEFAULT_SETTINGS = {
  method: 'Egyptian',
  madhab: 'shafi',
  notifications: true,
  theme: 'auto', // auto | light | dark
  hijriOffset: 0, // تعديل التاريخ الهجري بالأيام (-2 إلى +2)
  locationMode: 'auto', // auto (GPS) | manual (مدينة)
  cityId: 'cairo',
  adhanSound: 'default', // default (صوت الموبايل) | custom (adhan.wav)
  preReminder: 0, // تنبيه قبل الأذان بالدقايق (0 = متوقف)
  adjust: { fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 }, // ضبط دقائق كل صلاة
  fridayReminder: true, // تذكير الجمعة وسورة الكهف
};

function getParams(st) {
  const factory = CalculationMethod[st.method] || CalculationMethod.Egyptian;
  const params = factory();
  params.madhab = st.madhab === 'hanafi' ? Madhab.Hanafi : Madhab.Shafi;
  const adj = st.adjust || {};
  Object.keys(adj).forEach((k) => {
    params.adjustments[k] = (params.adjustments[k] || 0) + (adj[k] || 0);
  });
  return params;
}

function methodLabel(key) {
  const found = METHODS.find(([k]) => k === key);
  return found ? found[1] : key;
}

/* =====================================================
   المواقيت
===================================================== */

// [الصلاة، الاسم، أيقونة Ionicons]
const NAMES = [
  [Prayer.Fajr, 'الفجر', 'cloudy-night-outline'],
  [Prayer.Sunrise, 'الشروق', 'sunny-outline'],
  [Prayer.Dhuhr, 'الظهر', 'sunny'],
  [Prayer.Asr, 'العصر', 'partly-sunny'],
  [Prayer.Maghrib, 'المغرب', 'moon-outline'],
  [Prayer.Isha, 'العشاء', 'moon'],
];

const DEFAULT_COORDS = { latitude: 30.0444, longitude: 31.2357 };

// قايمة مدن للاختيار اليدوي (بتشتغل بدون إنترنت)
const CITIES = [
  { id: 'cairo', name: 'القاهرة', country: 'مصر', lat: 30.0444, lng: 31.2357 },
  { id: 'giza', name: 'الجيزة', country: 'مصر', lat: 30.0131, lng: 31.2089 },
  { id: 'alexandria', name: 'الإسكندرية', country: 'مصر', lat: 31.2001, lng: 29.9187 },
  { id: 'portsaid', name: 'بورسعيد', country: 'مصر', lat: 31.2653, lng: 32.3019 },
  { id: 'suez', name: 'السويس', country: 'مصر', lat: 29.9668, lng: 32.5498 },
  { id: 'ismailia', name: 'الإسماعيلية', country: 'مصر', lat: 30.5965, lng: 32.2715 },
  { id: 'damietta', name: 'دمياط', country: 'مصر', lat: 31.4165, lng: 31.8133 },
  { id: 'mansoura', name: 'المنصورة', country: 'مصر', lat: 31.0409, lng: 31.3785 },
  { id: 'tanta', name: 'طنطا', country: 'مصر', lat: 30.7865, lng: 31.0004 },
  { id: 'zagazig', name: 'الزقازيق', country: 'مصر', lat: 30.5877, lng: 31.502 },
  { id: 'banha', name: 'بنها', country: 'مصر', lat: 30.466, lng: 31.1848 },
  { id: 'shibin', name: 'شبين الكوم', country: 'مصر', lat: 30.5584, lng: 31.009 },
  { id: 'damanhur', name: 'دمنهور', country: 'مصر', lat: 31.0341, lng: 30.4682 },
  { id: 'kafrelsheikh', name: 'كفر الشيخ', country: 'مصر', lat: 31.1107, lng: 30.9388 },
  { id: 'fayoum', name: 'الفيوم', country: 'مصر', lat: 29.3084, lng: 30.8428 },
  { id: 'benisuef', name: 'بني سويف', country: 'مصر', lat: 29.0661, lng: 31.0994 },
  { id: 'minya', name: 'المنيا', country: 'مصر', lat: 28.1099, lng: 30.7503 },
  { id: 'asyut', name: 'أسيوط', country: 'مصر', lat: 27.1809, lng: 31.1837 },
  { id: 'sohag', name: 'سوهاج', country: 'مصر', lat: 26.5591, lng: 31.6948 },
  { id: 'qena', name: 'قنا', country: 'مصر', lat: 26.1551, lng: 32.716 },
  { id: 'luxor', name: 'الأقصر', country: 'مصر', lat: 25.6872, lng: 32.6396 },
  { id: 'aswan', name: 'أسوان', country: 'مصر', lat: 24.0889, lng: 32.8998 },
  { id: 'hurghada', name: 'الغردقة', country: 'مصر', lat: 27.2579, lng: 33.8116 },
  { id: 'sharm', name: 'شرم الشيخ', country: 'مصر', lat: 27.9158, lng: 34.33 },
  { id: 'matruh', name: 'مرسى مطروح', country: 'مصر', lat: 31.3543, lng: 27.2373 },
  { id: 'arish', name: 'العريش', country: 'مصر', lat: 31.1316, lng: 33.7984 },
  { id: 'tor', name: 'الطور', country: 'مصر', lat: 28.241, lng: 33.6222 },
  { id: 'kharga', name: 'الخارجة', country: 'مصر', lat: 25.4518, lng: 30.5464 },
  { id: 'makkah', name: 'مكة المكرمة', country: 'السعودية', lat: 21.3891, lng: 39.8579 },
  { id: 'madinah', name: 'المدينة المنورة', country: 'السعودية', lat: 24.5247, lng: 39.5692 },
  { id: 'riyadh', name: 'الرياض', country: 'السعودية', lat: 24.7136, lng: 46.6753 },
  { id: 'jeddah', name: 'جدة', country: 'السعودية', lat: 21.4858, lng: 39.1925 },
  { id: 'dammam', name: 'الدمام', country: 'السعودية', lat: 26.4207, lng: 50.0888 },
  { id: 'dubai', name: 'دبي', country: 'الإمارات', lat: 25.2048, lng: 55.2708 },
  { id: 'abudhabi', name: 'أبوظبي', country: 'الإمارات', lat: 24.4539, lng: 54.3773 },
  { id: 'kuwait', name: 'مدينة الكويت', country: 'الكويت', lat: 29.3759, lng: 47.9774 },
  { id: 'doha', name: 'الدوحة', country: 'قطر', lat: 25.2854, lng: 51.531 },
  { id: 'manama', name: 'المنامة', country: 'البحرين', lat: 26.2285, lng: 50.586 },
  { id: 'muscat', name: 'مسقط', country: 'عُمان', lat: 23.588, lng: 58.3829 },
  { id: 'amman', name: 'عمّان', country: 'الأردن', lat: 31.9454, lng: 35.9284 },
  { id: 'jerusalem', name: 'القدس', country: 'فلسطين', lat: 31.7683, lng: 35.2137 },
  { id: 'gaza', name: 'غزة', country: 'فلسطين', lat: 31.5017, lng: 34.4668 },
  { id: 'beirut', name: 'بيروت', country: 'لبنان', lat: 33.8938, lng: 35.5018 },
  { id: 'damascus', name: 'دمشق', country: 'سوريا', lat: 33.5138, lng: 36.2765 },
  { id: 'baghdad', name: 'بغداد', country: 'العراق', lat: 33.3152, lng: 44.3661 },
  { id: 'sanaa', name: 'صنعاء', country: 'اليمن', lat: 15.3694, lng: 44.191 },
  { id: 'khartoum', name: 'الخرطوم', country: 'السودان', lat: 15.5007, lng: 32.5599 },
  { id: 'tripoli', name: 'طرابلس', country: 'ليبيا', lat: 32.8872, lng: 13.1913 },
  { id: 'tunis', name: 'تونس', country: 'تونس', lat: 36.8065, lng: 10.1815 },
  { id: 'algiers', name: 'الجزائر', country: 'الجزائر', lat: 36.7538, lng: 3.0588 },
  { id: 'casablanca', name: 'الدار البيضاء', country: 'المغرب', lat: 33.5731, lng: -7.5898 },
  { id: 'rabat', name: 'الرباط', country: 'المغرب', lat: 34.0209, lng: -6.8416 },
  { id: 'istanbul', name: 'إسطنبول', country: 'تركيا', lat: 41.0082, lng: 28.9784 },
  { id: 'london', name: 'لندن', country: 'بريطانيا', lat: 51.5074, lng: -0.1278 },
  { id: 'paris', name: 'باريس', country: 'فرنسا', lat: 48.8566, lng: 2.3522 },
  { id: 'berlin', name: 'برلين', country: 'ألمانيا', lat: 52.52, lng: 13.405 },
  { id: 'newyork', name: 'نيويورك', country: 'أمريكا', lat: 40.7128, lng: -74.006 },
  { id: 'toronto', name: 'تورونتو', country: 'كندا', lat: 43.6532, lng: -79.3832 },
  { id: 'sydney', name: 'سيدني', country: 'أستراليا', lat: -33.8688, lng: 151.2093 },
  { id: 'karachi', name: 'كراتشي', country: 'باكستان', lat: 24.8607, lng: 67.0011 },
  { id: 'jakarta', name: 'جاكرتا', country: 'إندونيسيا', lat: -6.2088, lng: 106.8456 },
  { id: 'kualalumpur', name: 'كوالالمبور', country: 'ماليزيا', lat: 3.139, lng: 101.6869 },
];

function fmtTime(date) {
  const h = date.getHours() % 12 === 0 ? 12 : date.getHours() % 12;
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m} ${date.getHours() < 12 ? 'ص' : 'م'}`;
}

function fmtDuration(ms) {
  if (ms < 0) return '--:--:--';
  const sec = Math.floor(ms / 1000);
  const two = (n) => String(n).padStart(2, '0');
  return `${two(Math.floor(sec / 3600))}:${two(Math.floor((sec % 3600) / 60))}:${two(sec % 60)}`;
}

// ملف صوت الأذان لازم يتحط في assets/sounds/adhan.wav ويتضاف في app.json
// (شوف الخطوات). iOS بيقبل مدة أقصاها 30 ثانية.
const ADHAN_FILE = 'adhan.wav';
let customSoundOk = true; // بيبقى false لو قناة الصوت المخصص فشلت
const useCustom = (st) => st.adhanSound === 'custom' && customSoundOk;
const channelFor = (st) => (useCustom(st) ? 'adhan_custom' : 'adhan');
const soundFor = (st) => (useCustom(st) ? ADHAN_FILE : 'default');

function scheduleSig(lat, lng, st) {
  return `${lat.toFixed(2)},${lng.toFixed(2)},${st.method},${st.madhab},${st.adhanSound},${
    st.preReminder || 0
  },${JSON.stringify(st.adjust || {})},${st.fridayReminder ? 1 : 0}`;
}

// على أندرويد 13+ لازم القنوات تتعمل قبل طلب إذن الإشعارات، وإلا النافذة مبتظهرش
async function ensureChannelAndPermission() {
  if (Platform.OS === 'android') {
    // صوت القناة في أندرويد مينفعش يتغير بعد ما تتعمل، فعملنا قناتين منفصلتين
    try {
      await Notifications.setNotificationChannelAsync('adhan', {
        name: 'الأذان',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
        vibrationPattern: [0, 250, 250, 250],
      });
    } catch (e) {}
    // الصوت المخصص بيفشل لو الملف مش مضمّن في الـ build (أو في Expo Go).
    // في الحالة دي بنرجع لصوت الموبايل العادي بدل ما التنبيهات كلها تقف.
    try {
      await Notifications.setNotificationChannelAsync('adhan_custom', {
        name: 'الأذان (صوت الأذان)',
        importance: Notifications.AndroidImportance.HIGH,
        sound: ADHAN_FILE,
        vibrationPattern: [0, 250, 250, 250],
      });
      customSoundOk = true;
    } catch (e) {
      customSoundOk = false;
    }
  }
  // منطلبش الإذن من جديد لو متمنوح قبل كده
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    ({ status } = await Notifications.requestPermissionsAsync());
  }
  return status === 'granted';
}

async function scheduleAdhan(c, st) {
  // بنلغي إشعارات الأذان بس، مش كل إشعارات التطبيق
  const oldIds = await load('adhan:ids', []);
  await Promise.all(
    (Array.isArray(oldIds) ? oldIds : []).map((id) =>
      Notifications.cancelScheduledNotificationAsync(id).catch(() => {})
    )
  );
  await save('adhan:ids', []);
  await save('adhan:sig', null);
  if (!st.notifications) return 'off';

  const ok = await ensureChannelAndPermission();
  if (!ok) return 'denied';

  const pre = Number(st.preReminder) || 0;
  const perDay = pre > 0 ? 10 : 5;
  // iOS بيسمح بـ 64 إشعار مجدول بس، فبنقلل عدد الأيام لو التنبيه المسبق شغال
  const days = Platform.OS === 'ios' ? Math.max(1, Math.floor(60 / perDay)) : 14;

  const nowDate = new Date();
  const ids = [];
  for (let d = 0; d < days; d++) {
    const day = new Date(
      nowDate.getFullYear(),
      nowDate.getMonth(),
      nowDate.getDate() + d,
      12
    );
    const pt = new PrayerTimes(c, day, getParams(st));

    // تذكير الجمعة الساعة 8 الصبح
    if (st.fridayReminder && day.getDay() === 5) {
      const fw = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 8, 0);
      if (fw > nowDate) {
        try {
          const fid = await Notifications.scheduleNotificationAsync({
            content: {
              title: 'جمعة مباركة 🕌',
              body: 'لا تنسَ قراءة سورة الكهف والإكثار من الصلاة على النبي ﷺ',
              sound: 'default',
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: fw,
              channelId: 'adhan',
            },
          });
          ids.push(fid);
        } catch (e) {}
      }
    }
    for (const [prayer, label] of NAMES) {
      if (prayer === Prayer.Sunrise) continue;
      const when = pt.timeForPrayer(prayer);
      const lbl = prayer === Prayer.Dhuhr && day.getDay() === 5 ? 'الجمعة' : label;

      // التنبيه المسبق (بصوت الموبايل العادي، مش صوت الأذان)
      if (pre > 0) {
        const preWhen = new Date(when.getTime() - pre * 60 * 1000);
        if (preWhen > nowDate) {
          try {
            const pid = await Notifications.scheduleNotificationAsync({
              content: {
                title: `باقي ${pre} دقيقة على أذان ${lbl}`,
                body: 'استعد للصلاة',
                sound: 'default',
              },
              trigger: {
                type: Notifications.SchedulableTriggerInputTypes.DATE,
                date: preWhen,
                channelId: 'adhan',
              },
            });
            ids.push(pid);
          } catch (e) {}
        }
      }

      if (when <= nowDate) continue;
      try {
        const id = await Notifications.scheduleNotificationAsync({
          content: {
            title: `حان الآن موعد أذان ${lbl}`,
            body: 'حي على الصلاة',
            sound: soundFor(st),
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: when,
            channelId: channelFor(st),
          },
        });
        ids.push(id);
      } catch (e) {}
    }
  }
  await save('adhan:ids', ids);
  await save('adhan:sig', {
    sig: scheduleSig(c.latitude, c.longitude, st),
    at: Date.now(),
  });
  return 'on';
}

// تسلسل الجدولة: بيمنع تشغيلين متداخلين (كانوا ممكن يعملوا إشعارات مكررة)
let scheduleQueue = Promise.resolve();
function scheduleAdhanSafe(c, st) {
  const run = () => scheduleAdhan(c, st);
  scheduleQueue = scheduleQueue.then(run, run);
  return scheduleQueue;
}

async function sendTestNotification(st) {
  const ok = await ensureChannelAndPermission();
  if (!ok) return false;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'تجربة تنبيه الأذان',
      body: 'لو وصلك الإشعار ده، التنبيهات شغالة ✅',
      sound: soundFor(st),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 5,
      channelId: channelFor(st),
    },
  });
  return true;
}

/* =====================================================
   تتبع الصلوات
===================================================== */

const FARD = [
  ['fajr', 'الفجر'],
  ['dhuhr', 'الظهر'],
  ['asr', 'العصر'],
  ['maghrib', 'المغرب'],
  ['isha', 'العشاء'],
];

function calcStreak(log) {
  const isFull = (k) => log[k] && FARD.every(([id]) => log[k][id]);
  const d = new Date();
  if (!isFull(todayKey(d))) d.setDate(d.getDate() - 1); // اليوم لسه مخلصش، منكسرش السلسلة
  let streak = 0;
  while (isFull(todayKey(d))) {
    streak += 1;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

function PrayerTracker() {
  const { s, t } = useTheme();
  const [log, setLog] = useState({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    load('prayerlog', {}).then((l) => {
      setLog(l && typeof l === 'object' ? l : {});
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (!ready) return;
    // نخزن آخر 90 يوم بس
    const keys = Object.keys(log).sort().slice(-90);
    const trimmed = {};
    keys.forEach((k) => {
      trimmed[k] = log[k];
    });
    save('prayerlog', trimmed);
  }, [log, ready]);

  const key = todayKey();
  const today = log[key] || {};
  const doneCount = FARD.filter(([id]) => today[id]).length;
  const streak = calcStreak(log);

  const toggle = (id) => {
    Vibration.vibrate(15);
    setLog((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || {}), [id]: !(prev[key] || {})[id] },
    }));
  };

  return (
    <View style={[s.card, { marginBottom: 16, alignItems: 'stretch' }]}>
      <Text style={[s.cardTitle, { textAlign: 'right', marginBottom: 6 }]}>صلواتي اليوم</Text>
      <Text style={[s.note, { textAlign: 'right', marginBottom: 12 }]}>
        {toArabicDigits(doneCount)} من ٥ • أيام متتالية: {toArabicDigits(streak)}
      </Text>
      <View style={s.progressTrack}>
        <View style={[s.progressFill, { width: `${(doneCount / 5) * 100}%` }]} />
      </View>
      <View style={[s.trackerRow, { marginTop: 14 }]}>
        {FARD.map(([id, label]) => {
          const on = !!today[id];
          return (
            <Pressable
              key={id}
              onPress={() => toggle(id)}
              accessibilityRole="checkbox"
              accessibilityLabel={`صلاة ${label}`}
              accessibilityState={{ checked: on }}
              style={({ pressed }) => [
                s.trackerItem,
                on && s.trackerItemOn,
                pressed && s.pressed,
              ]}
            >
              <Ionicons
                name={on ? 'checkmark-circle' : 'ellipse-outline'}
                size={24}
                color={on ? t.primary : t.sub}
              />
              <Text style={[s.trackerLabel, on && s.trackerLabelOn]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/* =====================================================
   شاشة المواقيت
===================================================== */

// بيفتح إعدادات تحسين البطارية في أندرويد (لو فشل بيفتح إعدادات التطبيق)
async function openBatterySettings() {
  try {
    await Linking.sendIntent('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS');
  } catch (e) {
    try {
      await Linking.openSettings();
    } catch (e2) {}
  }
}

function BatteryTipCard({ onDismiss }) {
  const { s, t } = useTheme();
  return (
    <View style={[s.card, { marginBottom: 16, alignItems: 'stretch' }]}>
      <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Ionicons name="battery-charging-outline" size={22} color={t.gold} />
        <Text style={[s.cardTitle, { marginBottom: 0 }]}>عشان الأذان يوصلك في وقته</Text>
      </View>
      <Text style={[s.note, { textAlign: 'right', marginBottom: 12, lineHeight: 20 }]}>
        بعض الموبايلات (شاومي، أوبو، سامسونج، هواوي...) بتوقف التطبيقات في الخلفية لتوفير البطارية، وده
        ممكن يأخّر التنبيه أو يمنعه. استثنِ التطبيق من توفير البطارية، وفعّل التشغيل التلقائي لو
        الموبايل بيوفّره.
      </Text>
      <Button title="فتح إعدادات البطارية" icon="settings-outline" onPress={openBatterySettings} />
      <Pressable onPress={onDismiss} style={{ alignSelf: 'center', marginTop: 10, padding: 6 }}>
        <Text style={[s.note, { color: t.primary, fontFamily: F.bold }]}>تم، لا تذكّرني</Text>
      </Pressable>
    </View>
  );
}

function PrayerScreen({ active, settings, onOpenSurah }) {
  const { s, t } = useTheme();
  const manual = settings.locationMode === 'manual';
  const city = CITIES.find((x) => x.id === settings.cityId) || CITIES[0];

  const [gps, setGps] = useState(null);
  const [locPerm, setLocPerm] = useState(null); // null | true | false
  const [now, setNow] = useState(new Date());
  const [heading, setHeading] = useState(null);
  const [notifStatus, setNotifStatus] = useState('جاري تفعيل التنبيهات...');
  const [fgTick, setFgTick] = useState(0);
  const [batteryDone, setBatteryDone] = useState(true); // true لحد ما نقرا القيمة المحفوظة

  useEffect(() => {
    if (Platform.OS === 'android') load('battery:done', false).then((v) => setBatteryDone(!!v));
  }, []);

  // الإحداثيات: من المدينة المختارة، أو من الـ GPS، أو القاهرة كافتراضي
  const coords = manual
    ? { latitude: city.lat, longitude: city.lng }
    : gps || DEFAULT_COORDS;
  const note = manual
    ? `المدينة: ${city.name} (اختيار يدوي)`
    : gps
    ? 'حسب موقعك الحالي'
    : 'الموقع الافتراضي: القاهرة';

  // طلب صلاحية الموقع مرة واحدة (للـ GPS وللبوصلة)
  useEffect(() => {
    Location.requestForegroundPermissionsAsync()
      .then(({ status }) => setLocPerm(status === 'granted'))
      .catch(() => setLocPerm(false));
  }, []);

  // اتجاه الموبايل للبوصلة
  useEffect(() => {
    if (!locPerm) return undefined;
    let headingSub = null;
    let cancelled = false;
    (async () => {
      try {
        const sub = await Location.watchHeadingAsync((h) => {
          setHeading(h.trueHeading >= 0 ? h.trueHeading : h.magHeading);
        });
        if (cancelled) sub.remove();
        else headingSub = sub;
      } catch (e) {}
    })();
    return () => {
      cancelled = true;
      if (headingSub) headingSub.remove();
    };
  }, [locPerm]);

  // الـ GPS: بيتحدّث كل ما التطبيق يرجع للمقدمة (لو سافرت مثلًا)
  useEffect(() => {
    if (manual || !locPerm) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;
        const next = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        setGps((prev) =>
          prev &&
          Math.abs(prev.latitude - next.latitude) < 0.1 &&
          Math.abs(prev.longitude - next.longitude) < 0.1
            ? prev
            : next
        );
      } catch (e) {}
    })();
    return () => {
      cancelled = true;
    };
  }, [manual, locPerm, fgTick]);

  // إعادة الجدولة لما التطبيق يرجع للمقدمة
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') setFgTick((n) => n + 1);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const c = new Coordinates(coords.latitude, coords.longitude);
      try {
        // لو الإعدادات زي ما هي وآخر جدولة من أقل من 12 ساعة، منعيدش
        const prev = await load('adhan:sig', null);
        const sig = scheduleSig(coords.latitude, coords.longitude, settings);
        if (
          settings.notifications &&
          prev &&
          prev.sig === sig &&
          Date.now() - prev.at < 12 * 60 * 60 * 1000
        ) {
          if (!cancelled) setNotifStatus('تنبيهات الأذان مفعّلة ✅');
          return;
        }
        const r = await scheduleAdhanSafe(c, settings);
        if (cancelled) return;
        setNotifStatus(
          r === 'on'
            ? 'تنبيهات الأذان مفعّلة ✅'
            : r === 'off'
            ? 'تنبيهات الأذان متوقفة (من الإعدادات)'
            : 'التنبيهات مقفولة: فعّلها من إعدادات الموبايل'
        );
      } catch (e) {
        if (!cancelled) setNotifStatus('حصلت مشكلة: ' + ((e && e.message) || 'غير معروفة'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    coords.latitude,
    coords.longitude,
    settings.method,
    settings.madhab,
    settings.notifications,
    settings.adhanSound,
    settings.preReminder,
    JSON.stringify(settings.adjust),
    settings.fridayReminder,
    fgTick,
  ]);

  // العدّاد بيشتغل بس لما الشاشة ظاهرة (توفير للبطارية)
  useEffect(() => {
    if (!active) return undefined;
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [active]);

  const c = new Coordinates(coords.latitude, coords.longitude);
  const times = new PrayerTimes(c, now, getParams(settings));
  const next = times.nextPrayer();
  const isFriday = now.getDay() === 5;

  // بعد المغرب بيبدأ اليوم الهجري الجديد
  const hijriBase = now >= times.maghrib ? new Date(now.getTime() + 86400000) : now;
  const hijriStr = formatHijri(
    new Date(hijriBase.getTime() + (settings.hijriOffset || 0) * 86400000)
  );

  let nextLabel = 'الفجر';
  let nextTime;
  if (next === Prayer.None) {
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    nextTime = new PrayerTimes(c, tomorrow, getParams(settings)).fajr;
  } else {
    nextLabel = NAMES.find(([p]) => p === next)[1];
    if (next === Prayer.Dhuhr && isFriday) nextLabel = 'الجمعة';
    nextTime = times.timeForPrayer(next);
  }

  const qibla = Qibla(c);
  const arrowAngle = heading === null ? 0 : (qibla - heading + 360) % 360;
  const diff = Math.min(arrowAngle, 360 - arrowAngle);
  const aligned = heading !== null && diff < 5;

  return (
    <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <Header small={hijriStr} title="مواقيت الصلاة" />

      <View style={s.heroWrap}>
        <LinearGradient
          colors={t.heroGrad}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.hero}
        >
          <View style={s.heroCircleA} />
          <View style={s.heroCircleB} />
          <Text style={s.heroTitle}>الصلاة القادمة</Text>
          <Text style={s.heroPrayer}>{nextLabel}</Text>
          <Text style={s.countdown}>{fmtDuration(nextTime - now)}</Text>
          <Text style={s.heroMeta}>{note}</Text>
          <Text style={s.heroMeta}>طريقة الحساب: {methodLabel(settings.method)}</Text>
          <Text style={s.heroMeta}>{notifStatus}</Text>
        </LinearGradient>
      </View>

      {Platform.OS === 'android' && settings.notifications && !batteryDone ? (
        <BatteryTipCard
          onDismiss={() => {
            setBatteryDone(true);
            save('battery:done', true);
          }}
        />
      ) : null}

      {isFriday ? (
        <View style={[s.card, { marginBottom: 16, alignItems: 'stretch' }]}>
          <Text style={[s.cardTitle, { textAlign: 'right', marginBottom: 6 }]}>
            جمعة مباركة
          </Text>
          <Text style={[s.note, { textAlign: 'right', marginBottom: 12 }]}>
            لا تنسَ قراءة سورة الكهف، والإكثار من الصلاة على النبي ﷺ، والدعاء في ساعة الاستجابة.
          </Text>
          <Button
            title="افتح سورة الكهف"
            icon="book-outline"
            variant="soft"
            onPress={() => onOpenSurah && onOpenSurah(18, 'سورة الكهف')}
          />
        </View>
      ) : null}

      {NAMES.map(([prayer, label, icon]) => {
        const isNext = prayer === next;
        const when = times.timeForPrayer(prayer);
        const passed = when < now && !isNext;
        return (
          <View key={label} style={[s.row, isNext && s.rowNext, passed && s.rowPassed]}>
            <View style={s.rowRight}>
              <View style={[s.rowIconWrap, isNext && s.rowIconWrapNext]}>
                <Ionicons name={icon} size={20} color={isNext ? '#fff' : t.primary} />
              </View>
              <Text style={[s.label, isNext && s.bold]}>
                {prayer === Prayer.Dhuhr && isFriday ? 'الجمعة' : label}
              </Text>
              {isNext && <Text style={s.nextBadge}>● التالية</Text>}
            </View>
            <Text style={s.time}>{fmtTime(when)}</Text>
          </View>
        );
      })}

      <View style={{ height: 8 }} />
      <PrayerTracker />

      <View style={s.btnWrap}>
        <Button
          title="تجربة تنبيه بعد 5 ثواني"
          icon="notifications-outline"
          onPress={async () => {
            try {
              const ok = await sendTestNotification(settings);
              setNotifStatus(
                ok ? 'هيوصلك إشعار تجربة بعد 5 ثواني (اطلع من التطبيق)' : 'التنبيهات مقفولة'
              );
            } catch (e) {
              setNotifStatus('خطأ: ' + ((e && e.message) || 'غير معروف'));
            }
          }}
        />
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>اتجاه القبلة</Text>
        <View style={[s.compassCircle, aligned && s.compassAligned]}>
          <View style={{ transform: [{ rotate: `${arrowAngle}deg` }], alignItems: 'center' }}>
            <Ionicons name="caret-up" size={40} color={t.primary} />
            <Text style={s.kaaba}>🕋</Text>
          </View>
        </View>
        <Text style={[s.compassHint, aligned && s.compassHintOk]}>
          {heading === null
            ? 'جاري تحديد اتجاه الموبايل... (اسمح بالموقع)'
            : aligned
            ? '✓ أنت في اتجاه القبلة'
            : 'لف الموبايل لحد ما السهم يبقى لفوق'}
        </Text>
        <Text style={s.note}>زاوية القبلة: {qibla.toFixed(1)}°</Text>
      </View>
    </ScrollView>
  );
}

/* =====================================================
   المصحف
   النص بيتجاب من AlQuran Cloud API (الرسم العثماني)
   ويتخزن محليًا للقراءة بدون إنترنت.
===================================================== */

const QURAN_API = 'https://api.alquran.cloud/v1';

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`http ${r.status}`);
  return r.json();
}

async function getSurahList() {
  const cached = await load('quran:list', null);
  if (cached && cached.length === 114) return cached;
  const j = await fetchJson(`${QURAN_API}/surah`);
  if (!j || !Array.isArray(j.data)) throw new Error('bad data');
  const list = j.data.map((x) => ({
    n: x.number,
    name: x.name,
    en: x.englishName,
    count: x.numberOfAyahs,
    type: x.revelationType,
  }));
  await save('quran:list', list);
  return list;
}

async function getSurah(n) {
  const cached = await load(`quran:s${n}`, null);
  if (cached && cached.length) return cached;
  const j = await fetchJson(`${QURAN_API}/surah/${n}/quran-uthmani`);
  if (!j || !j.data || !Array.isArray(j.data.ayahs)) throw new Error('bad data');
  const ayahs = j.data.ayahs.map((a) => ({ i: a.numberInSurah, t: a.text }));
  await save(`quran:s${n}`, ayahs);
  return ayahs;
}

const normalizeAr = (str) =>
  str
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/[ٱأإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ـ/g, '');

function QuranReader({
  surah,
  startIndex,
  fontSize,
  setFontSize,
  bookmarks,
  toggleBookmark,
  onBack,
  onProgress,
}) {
  const { s, t } = useTheme();
  const [state, setState] = useState({ loading: true, error: false, ayahs: [], bism: '' });
  const [attempt, setAttempt] = useState(0);
  const listRef = useRef(null);

  const progressRef = useRef(onProgress);
  progressRef.current = onProgress;
  const onViewable = useRef(({ viewableItems }) => {
    if (viewableItems && viewableItems.length && viewableItems[0].index != null) {
      progressRef.current(viewableItems[0].index);
    }
  }).current;
  const vcfg = useRef({ itemVisiblePercentThreshold: 50 }).current;

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: false, ayahs: [], bism: '' });
    (async () => {
      try {
        const ayahs = await getSurah(surah.n);
        let list = ayahs;
        let bismText = '';
        // البسملة في أول كل سورة (عدا الفاتحة والتوبة) بتيجي ملتصقة بالآية الأولى في البيانات،
        // فبنفصلها ونعرضها كعنوان.
        if (surah.n !== 1 && surah.n !== 9) {
          const fatiha = await getSurah(1);
          const b = ((fatiha[0] && fatiha[0].t) || '').trim();
          if (b) {
            bismText = b;
            if (ayahs[0] && ayahs[0].t.startsWith(b)) {
              list = [{ ...ayahs[0], t: ayahs[0].t.slice(b.length).trim() }, ...ayahs.slice(1)];
            }
          }
        }
        if (!cancelled) setState({ loading: false, error: false, ayahs: list, bism: bismText });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: true, ayahs: [], bism: '' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [surah.n, attempt]);

  useEffect(() => {
    if (!state.loading && !state.error && startIndex > 0) {
      const id = setTimeout(() => {
        try {
          if (listRef.current) {
            listRef.current.scrollToIndex({ index: startIndex, animated: false });
          }
        } catch (e) {}
      }, 200);
      return () => clearTimeout(id);
    }
  }, [state.loading]);

  return (
    <View style={{ flex: 1 }}>
      <View style={s.readerBar}>
        <Pressable
          onPress={onBack}
          style={({ pressed }) => [s.pill, pressed && s.pressed]}
        >
          <Text style={s.pillText}>→ السور</Text>
        </Pressable>
        <Text style={s.readerTitle}>{surah.name}</Text>
        <View style={s.fontCtl}>
          <Pressable
            onPress={() => setFontSize(Math.max(20, fontSize - 2))}
            style={({ pressed }) => [s.pill, pressed && s.pressed]}
          >
            <Text style={s.pillText}>أ−</Text>
          </Pressable>
          <Pressable
            onPress={() => setFontSize(Math.min(44, fontSize + 2))}
            style={({ pressed }) => [s.pill, pressed && s.pressed]}
          >
            <Text style={s.pillText}>أ+</Text>
          </Pressable>
        </View>
      </View>

      {state.loading ? (
        <View style={[{ flex: 1 }, s.center]}>
          <Text style={s.note}>جاري تحميل السورة...</Text>
        </View>
      ) : state.error ? (
        <View style={[{ flex: 1, padding: 24 }, s.center]}>
          <Text style={[s.note, { marginBottom: 12 }]}>
            تعذّر تحميل السورة. محتاج إنترنت أول مرة بس، وبعدها بتتخزن في الموبايل.
          </Text>
          <Button
            title="إعادة المحاولة"
            icon="refresh"
            variant="outline"
            onPress={() => setAttempt((a) => a + 1)}
          />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={state.ayahs}
          keyExtractor={(a) => String(a.i)}
          initialNumToRender={20}
          windowSize={10}
          contentContainerStyle={{ paddingBottom: TAB_SPACE }}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={vcfg}
          onScrollToIndexFailed={(info) => {
            if (listRef.current) {
              listRef.current.scrollToOffset({
                offset: info.averageItemLength * info.index,
                animated: false,
              });
            }
            setTimeout(() => {
              try {
                if (listRef.current) {
                  listRef.current.scrollToIndex({ index: info.index, animated: false });
                }
              } catch (e) {}
            }, 250);
          }}
          ListHeaderComponent={
            <View>
              {state.bism ? <Text style={s.bismillah}>{state.bism}</Text> : null}
              <Text style={[s.note, { marginBottom: 8 }]}>
                اضغط مطولًا على أي آية للمزيد (علامة مرجعية / مشاركة)
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const key = `${surah.n}:${item.i}`;
            const marked = bookmarks.includes(key);
            return (
              <Pressable
                delayLongPress={350}
                onLongPress={() => {
                  Vibration.vibrate(30);
                  Alert.alert(`${surah.name} — آية ${toArabicDigits(item.i)}`, undefined, [
                    {
                      text: marked ? 'إزالة العلامة المرجعية' : 'حفظ علامة مرجعية',
                      onPress: () => toggleBookmark(key),
                    },
                    {
                      text: 'مشاركة الآية',
                      onPress: () =>
                        Share.share({
                          message: `\uFD3F${item.t}\uFD3E\n[${surah.name}: ${toArabicDigits(item.i)}]`,
                        }).catch(() => {}),
                    },
                    { text: 'إلغاء', style: 'cancel' },
                  ]);
                }}
                style={({ pressed }) => [
                  s.ayahRow,
                  marked && s.ayahMarked,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text
                  style={[
                    s.ayahText,
                    { fontSize, lineHeight: Math.round(fontSize * 1.9) },
                  ]}
                >
                  {item.t}{' '}
                  <Text style={s.ayahNum}>
                    {'\uFD3F' + toArabicDigits(item.i) + '\uFD3E'}
                  </Text>
                </Text>
                {marked ? (
                  <View style={s.ayahMark}>
                    <Ionicons name="bookmark" size={16} color={t.gold} />
                  </View>
                ) : null}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

function QuranScreen({ active, jump }) {
  const { s, t } = useTheme();
  const [view, setView] = useState('list'); // list | bookmarks | reader
  const [surahs, setSurahs] = useState([]);
  const [listState, setListState] = useState('loading'); // loading | ready | error
  const [query, setQuery] = useState('');
  const [current, setCurrent] = useState(null); // { surah, startIndex }
  const [last, setLast] = useState(null); // { n, index }
  const [bookmarks, setBookmarks] = useState([]);
  const [fontSize, setFontSize] = useState(26);
  const [dl, setDl] = useState(null); // null | رقم السورة | 'done' | 'error'
  const [ready, setReady] = useState(false);
  const lastRef = useRef(null);
  const timerRef = useRef(null);

  const loadList = () => {
    setListState('loading');
    getSurahList()
      .then((l) => {
        setSurahs(l);
        setListState('ready');
      })
      .catch(() => setListState('error'));
  };

  useEffect(() => {
    loadList();
    Promise.all([
      load('quran:bookmarks', []),
      load('quran:fontSize', 26),
      load('quran:last', null),
      load('quran:full', false),
    ]).then(([b, f, l, full]) => {
      setBookmarks(Array.isArray(b) ? b : []);
      setFontSize(typeof f === 'number' ? f : 26);
      setLast(l);
      if (full) setDl('done');
      setReady(true);
    });
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (ready) save('quran:bookmarks', bookmarks);
  }, [bookmarks, ready]);

  useEffect(() => {
    if (ready) save('quran:fontSize', fontSize);
  }, [fontSize, ready]);

  // زرار الرجوع في أندرويد
  useEffect(() => {
    if (!active) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (view !== 'list') {
        setView('list');
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [active, view]);

  const toggleBookmark = (key) =>
    setBookmarks((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );

  const openSurah = (meta, startIndex = 0) => {
    setCurrent({ surah: meta, startIndex });
    setView('reader');
  };

  // فتح سورة من شاشة تانية (زي سورة الكهف يوم الجمعة)
  const jumpDone = useRef(null);
  useEffect(() => {
    if (!jump || jumpDone.current === jump.t) return;
    jumpDone.current = jump.t;
    const meta = surahs.find((x) => x.n === jump.n) || {
      n: jump.n,
      name: jump.name || `سورة ${jump.n}`,
      en: '',
      count: 0,
      type: 'Meccan',
    };
    openSurah(meta, 0);
  }, [jump]);

  const onProgress = (index) => {
    if (!current) return;
    lastRef.current = { n: current.surah.n, index };
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setLast(lastRef.current);
      save('quran:last', lastRef.current);
    }, 700);
  };

  const downloadAll = async () => {
    try {
      for (let n = 1; n <= 114; n++) {
        setDl(n);
        await getSurah(n);
      }
      setDl('done');
      save('quran:full', true);
    } catch (e) {
      setDl('error');
    }
  };

  if (view === 'reader' && current) {
    return (
      <QuranReader
        surah={current.surah}
        startIndex={current.startIndex}
        fontSize={fontSize}
        setFontSize={setFontSize}
        bookmarks={bookmarks}
        toggleBookmark={toggleBookmark}
        onBack={() => setView('list')}
        onProgress={onProgress}
      />
    );
  }

  const topBlock = (
    <View>
      <Header small="كلام الله" title="المصحف" />
      <View style={s.segment}>
        <Pressable
          style={({ pressed }) => [s.segBtn, view === 'list' && s.segBtnOn, pressed && s.pressed]}
          onPress={() => setView('list')}
        >
          <Text style={[s.segText, view === 'list' && s.segTextOn]}>السور</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            s.segBtn,
            view === 'bookmarks' && s.segBtnOn,
            pressed && s.pressed,
          ]}
          onPress={() => setView('bookmarks')}
        >
          <Text style={[s.segText, view === 'bookmarks' && s.segTextOn]}>
            العلامات ({toArabicDigits(bookmarks.length)})
          </Text>
        </Pressable>
      </View>
    </View>
  );

  // ===== العلامات المرجعية =====
  if (view === 'bookmarks') {
    const sorted = [...bookmarks].sort((a, b) => {
      const [sa, ia] = a.split(':').map(Number);
      const [sb, ib] = b.split(':').map(Number);
      return sa - sb || ia - ib;
    });
    return (
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {topBlock}
        {sorted.length === 0 ? (
          <Text style={s.note}>
            لسه مفيش علامات. افتح أي سورة واضغط مطولًا على الآية لحفظها.
          </Text>
        ) : (
          sorted.map((key) => {
            const [n, i] = key.split(':').map(Number);
            const meta = surahs.find((x) => x.n === n);
            return (
              <View key={key} style={s.surahRow}>
                <Pressable
                  style={({ pressed }) => [{ flex: 1 }, pressed && s.pressed]}
                  onPress={() => meta && openSurah(meta, i - 1)}
                >
                  <Text style={s.surahName}>{meta ? meta.name : `سورة ${n}`}</Text>
                  <Text style={s.surahMeta}>الآية {toArabicDigits(i)}</Text>
                </Pressable>
                <Pressable
                  onPress={() => toggleBookmark(key)}
                  style={({ pressed }) => [s.pill, pressed && s.pressed]}
                >
                  <Text style={s.pillText}>✕ حذف</Text>
                </Pressable>
              </View>
            );
          })
        )}
      </ScrollView>
    );
  }

  // ===== قائمة السور =====
  const q = normalizeAr(query.trim().toLowerCase());
  const filtered = q
    ? surahs.filter(
        (x) =>
          normalizeAr(x.name).includes(q) ||
          (x.en || '').toLowerCase().includes(q) ||
          String(x.n) === q
      )
    : surahs;

  const lastMeta = last ? surahs.find((x) => x.n === last.n) : null;

  const listHeader = (
    <View>
      {topBlock}

      {lastMeta ? (
        <View style={s.btnWrap}>
          <Button
            title={`متابعة القراءة: ${lastMeta.name} — آية ${toArabicDigits(last.index + 1)}`}
            icon="book-outline"
            onPress={() => openSurah(lastMeta, last.index)}
          />
        </View>
      ) : null}

      <TextInput
        style={s.input}
        value={query}
        onChangeText={setQuery}
        placeholder="ابحث باسم السورة أو رقمها..."
        placeholderTextColor={t.sub}
      />

      {dl === 'done' ? (
        <Text style={[s.note, { marginBottom: 12 }]}>
          ✓ المصحف كامل محمّل على موبايلك ويشتغل بدون إنترنت
        </Text>
      ) : typeof dl === 'number' ? (
        <View style={{ marginBottom: 12 }}>
          <Text style={s.note}>جاري التحميل... سورة {toArabicDigits(dl)} من ١١٤</Text>
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${(dl / 114) * 100}%` }]} />
          </View>
        </View>
      ) : (
        <View style={{ marginBottom: 12 }}>
          <Button
            title={
              dl === 'error'
                ? 'تعذّر التحميل، اضغط للمحاولة تاني'
                : 'تحميل المصحف كامل للقراءة بدون إنترنت'
            }
            icon="download-outline"
            variant="soft"
            onPress={downloadAll}
          />
        </View>
      )}

      {listState === 'loading' ? (
        <Text style={s.note}>جاري تحميل قائمة السور...</Text>
      ) : null}
      {listState === 'error' ? (
        <View style={{ marginBottom: 12 }}>
          <Text style={[s.note, { marginBottom: 8 }]}>
            تعذّر تحميل قائمة السور. محتاج إنترنت أول مرة بس.
          </Text>
          <Button title="إعادة المحاولة" icon="refresh" variant="outline" onPress={loadList} />
        </View>
      ) : null}
    </View>
  );

  return (
    <FlatList
      data={filtered}
      keyExtractor={(x) => String(x.n)}
      contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      initialNumToRender={20}
      ListHeaderComponent={listHeader}
      renderItem={({ item }) => (
        <Pressable
          onPress={() => openSurah(item, 0)}
          style={({ pressed }) => [s.surahRow, pressed && s.pressed]}
        >
          <View style={s.surahNum}>
            <Text style={s.surahNumText}>{toArabicDigits(item.n)}</Text>
          </View>
          <View style={s.surahInfo}>
            <Text style={s.surahName}>{item.name}</Text>
            <Text style={s.surahMeta}>
              {item.type === 'Meccan' ? 'مكية' : 'مدنية'} • {toArabicDigits(item.count)} آية
            </Text>
          </View>
          <Text style={s.surahEn}>{item.en}</Text>
        </Pressable>
      )}
    />
  );
}

/* =====================================================
   الأذكار
   راجع النصوص والأعداد مع مصدر موثوق (مثل حصن المسلم)
   قبل النشر. الآيات (الكرسي والإخلاص والمعوذتين) بتتحمّل من نص المصحف نفسه
   (مش مكتوبة هنا) عشان نتفادى أخطاء النسخ.
===================================================== */

const ADHKAR = [
  {
    id: 'a1',
    mode: 'morning',
    count: 1,
    text:
      'أَصْبَحْنَا وَأَصْبَحَ الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ، لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ',
  },
  {
    id: 'a2',
    mode: 'evening',
    count: 1,
    text:
      'أَمْسَيْنَا وَأَمْسَى الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ، لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ',
  },
  {
    id: 'a3',
    mode: 'morning',
    count: 1,
    text:
      'اللَّهُمَّ بِكَ أَصْبَحْنَا، وَبِكَ أَمْسَيْنَا، وَبِكَ نَحْيَا، وَبِكَ نَمُوتُ، وَإِلَيْكَ النُّشُورُ',
  },
  {
    id: 'a4',
    mode: 'evening',
    count: 1,
    text:
      'اللَّهُمَّ بِكَ أَمْسَيْنَا، وَبِكَ أَصْبَحْنَا، وَبِكَ نَحْيَا، وَبِكَ نَمُوتُ، وَإِلَيْكَ الْمَصِيرُ',
  },
  {
    id: 'a5',
    mode: 'both',
    count: 3,
    text:
      'بِسْمِ اللَّهِ الَّذِي لَا يَضُرُّ مَعَ اسْمِهِ شَيْءٌ فِي الْأَرْضِ وَلَا فِي السَّمَاءِ وَهُوَ السَّمِيعُ الْعَلِيمُ',
  },
  {
    id: 'a6',
    mode: 'both',
    count: 3,
    text: 'رَضِيتُ بِاللَّهِ رَبًّا، وَبِالْإِسْلَامِ دِينًا، وَبِمُحَمَّدٍ ﷺ نَبِيًّا',
  },
  {
    id: 'a7',
    mode: 'evening',
    count: 3,
    text: 'أَعُوذُ بِكَلِمَاتِ اللَّهِ التَّامَّاتِ مِنْ شَرِّ مَا خَلَقَ',
  },
  { id: 'a8', mode: 'both', count: 100, text: 'سُبْحَانَ اللَّهِ وَبِحَمْدِهِ' },
  { id: 'a9', mode: 'both', count: 100, text: 'أَسْتَغْفِرُ اللَّهَ وَأَتُوبُ إِلَيْهِ' },
  {
    id: 'a10',
    mode: 'both',
    count: 10,
    text:
      'لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ',
  },
  {
    id: 'a11',
    mode: 'both',
    count: 10,
    text: 'اللَّهُمَّ صَلِّ وَسَلِّمْ عَلَى نَبِيِّنَا مُحَمَّدٍ',
  },
  // ===== أذكار بعد الصلاة =====
  {
    id: 'ap1',
    mode: 'afterprayer',
    count: 3,
    text: 'أَسْتَغْفِرُ اللَّهَ',
  },
  {
    id: 'ap2',
    mode: 'afterprayer',
    count: 1,
    text:
      'اللَّهُمَّ أَنْتَ السَّلَامُ وَمِنْكَ السَّلَامُ، تَبَارَكْتَ يَا ذَا الْجَلَالِ وَالْإِكْرَامِ',
  },
  {
    id: 'ap3',
    mode: 'afterprayer',
    count: 1,
    text:
      'لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ، اللَّهُمَّ لَا مَانِعَ لِمَا أَعْطَيْتَ، وَلَا مُعْطِيَ لِمَا مَنَعْتَ، وَلَا يَنْفَعُ ذَا الْجَدِّ مِنْكَ الْجَدُّ',
  },
  { id: 'ap4', mode: 'afterprayer', count: 33, text: 'سُبْحَانَ اللَّهِ' },
  { id: 'ap5', mode: 'afterprayer', count: 33, text: 'الْحَمْدُ لِلَّهِ' },
  { id: 'ap6', mode: 'afterprayer', count: 33, text: 'اللَّهُ أَكْبَرُ' },
  {
    id: 'ap7',
    mode: 'afterprayer',
    count: 1,
    text:
      'لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ',
  },

  // ===== آيات بتتحمّل من المصحف (مشتركة بين أكتر من قسم) =====
  {
    id: 'q_kursi',
    mode: ['morning', 'evening', 'afterprayer', 'sleep'],
    count: 1,
    ref: { s: 2, from: 255, to: 255, label: 'آية الكرسي' },
  },
  {
    id: 'q_ikhlas',
    mode: ['morning', 'evening', 'afterprayer', 'sleep'],
    count: 3,
    counts: { afterprayer: 1 },
    ref: { s: 112, from: 1, to: 4, label: 'سورة الإخلاص' },
  },
  {
    id: 'q_falaq',
    mode: ['morning', 'evening', 'afterprayer', 'sleep'],
    count: 3,
    counts: { afterprayer: 1 },
    ref: { s: 113, from: 1, to: 5, label: 'سورة الفلق' },
  },
  {
    id: 'q_nas',
    mode: ['morning', 'evening', 'afterprayer', 'sleep'],
    count: 3,
    counts: { afterprayer: 1 },
    ref: { s: 114, from: 1, to: 6, label: 'سورة الناس' },
  },
  {
    id: 'ap8',
    mode: 'afterprayer',
    count: 1,
    text: 'اللَّهُمَّ أَعِنِّي عَلَى ذِكْرِكَ وَشُكْرِكَ وَحُسْنِ عِبَادَتِكَ',
  },

  // ===== أذكار النوم =====
  {
    id: 's1',
    mode: 'sleep',
    count: 1,
    text:
      'بِاسْمِكَ رَبِّي وَضَعْتُ جَنْبِي، وَبِكَ أَرْفَعُهُ، فَإِنْ أَمْسَكْتَ نَفْسِي فَارْحَمْهَا، وَإِنْ أَرْسَلْتَهَا فَاحْفَظْهَا بِمَا تَحْفَظُ بِهِ عِبَادَكَ الصَّالِحِينَ',
  },
  {
    id: 's2',
    mode: 'sleep',
    count: 3,
    text: 'اللَّهُمَّ قِنِي عَذَابَكَ يَوْمَ تَبْعَثُ عِبَادَكَ',
  },
  { id: 's3', mode: 'sleep', count: 33, text: 'سُبْحَانَ اللَّهِ' },
  { id: 's4', mode: 'sleep', count: 33, text: 'الْحَمْدُ لِلَّهِ' },
  { id: 's5', mode: 'sleep', count: 34, text: 'اللَّهُ أَكْبَرُ' },
  {
    id: 's6',
    mode: 'sleep',
    count: 1,
    text: 'بِاسْمِكَ اللَّهُمَّ أَمُوتُ وَأَحْيَا',
  },

  // ===== دعاء الاستيقاظ =====
  {
    id: 'w1',
    mode: 'wake',
    count: 1,
    text: 'الْحَمْدُ لِلَّهِ الَّذِي أَحْيَانَا بَعْدَ مَا أَمَاتَنَا وَإِلَيْهِ النُّشُورُ',
  },
  {
    id: 'w2',
    mode: 'wake',
    count: 1,
    text: 'الْحَمْدُ لِلَّهِ الَّذِي عَافَانِي فِي جَسَدِي، وَرَدَّ عَلَيَّ رُوحِي، وَأَذِنَ لِي بِذِكْرِهِ',
  },
];

const ADHKAR_MODES = [
  ['morning', 'الصباح'],
  ['evening', 'المساء'],
  ['afterprayer', 'بعد الصلاة'],
  ['sleep', 'النوم'],
  ['wake', 'الاستيقاظ'],
];

// الذكر بيظهر في أي قسم؟ ('both' = صباح ومساء بس)
function inMode(item, mode) {
  const m = item.mode;
  if (Array.isArray(m)) return m.includes(mode);
  if (m === 'both') return mode === 'morning' || mode === 'evening';
  return m === mode;
}

const countOf = (item, mode) => (item.counts && item.counts[mode]) || item.count;

// نص آية/سورة من المصحف المخزّن (من غير البسملة الملتصقة بأول آية)
async function getRefText(ref) {
  const ayahs = await getSurah(ref.s);
  let list = ayahs;
  if (ref.s !== 1 && ref.s !== 9) {
    const fatiha = await getSurah(1);
    const b = ((fatiha[0] && fatiha[0].t) || '').trim();
    if (b && ayahs[0] && ayahs[0].t.startsWith(b)) {
      list = [{ ...ayahs[0], t: ayahs[0].t.slice(b.length).trim() }, ...ayahs.slice(1)];
    }
  }
  return list
    .filter((a) => a.i >= ref.from && a.i <= ref.to)
    .map((a) => a.t)
    .join(' ');
}

function AdhkarScreen() {
  const { s } = useTheme();
  const [mode, setMode] = useState('morning');
  const [done, setDone] = useState({});
  const [ready, setReady] = useState(false);
  const [refTexts, setRefTexts] = useState({});
  const [refErr, setRefErr] = useState(false);

  const loadRefs = () => {
    setRefErr(false);
    ADHKAR.filter((a) => a.ref).forEach(async (a) => {
      try {
        const txt = await getRefText(a.ref);
        setRefTexts((prev) => ({ ...prev, [a.id]: txt }));
      } catch (e) {
        setRefErr(true);
      }
    });
  };

  useEffect(() => {
    load('adhkar', null).then((st) => {
      if (st && st.date === todayKey()) setDone(st.done || {});
      setReady(true);
    });
    loadRefs();
  }, []);

  useEffect(() => {
    if (ready) save('adhkar', { date: todayKey(), done });
  }, [done, ready]);

  const list = ADHKAR.filter((a) => inMode(a, mode));
  const missingRefs = ADHKAR.some((a) => a.ref && !refTexts[a.id]);

  const tap = (item) => {
    const key = `${mode}-${item.id}`;
    const current = done[key] || 0;
    const total = countOf(item, mode);
    if (current >= total) return;
    Vibration.vibrate(current + 1 === total ? 60 : 10);
    setDone((prev) => ({ ...prev, [key]: (prev[key] || 0) + 1 }));
  };

  // بيصفّر القسم الحالي بس
  const resetMode = () =>
    setDone((prev) => {
      const next = {};
      Object.keys(prev).forEach((k) => {
        if (!k.startsWith(`${mode}-`)) next[k] = prev[k];
      });
      return next;
    });

  return (
    <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <Header small="حصّن يومك" title="الأذكار" />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[s.chipsRow, { marginBottom: 12 }]}
      >
        {ADHKAR_MODES.map(([k, l]) => (
          <Pressable
            key={k}
            onPress={() => setMode(k)}
            style={({ pressed }) => [s.chip, mode === k && s.chipOn, pressed && s.pressed]}
          >
            <Text style={[s.chipText, mode === k && s.chipTextOn]}>{l}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <Text style={s.hintText}>
        {mode === 'afterprayer'
          ? 'اضغط على الذكر لتعدّه. بعد كل صلاة اضغط "ابدأ من جديد" في الآخر.'
          : 'اضغط على الذكر لتعدّ مرات التكرار'}
      </Text>

      {refErr && missingRefs ? (
        <View style={{ marginBottom: 12 }}>
          <Text style={[s.note, { marginBottom: 8 }]}>
            تعذّر تحميل نص بعض الآيات. محتاج إنترنت أول مرة بس.
          </Text>
          <Button title="إعادة تحميل" icon="refresh" variant="outline" onPress={loadRefs} />
        </View>
      ) : null}

      {list.map((item) => {
        const key = `${mode}-${item.id}`;
        const d = done[key] || 0;
        const total = countOf(item, mode);
        const finished = d >= total;
        const body = item.ref
          ? refTexts[item.id] || (refErr ? '...' : 'جاري تحميل النص...')
          : item.text;
        return (
          <Pressable
            key={key}
            onPress={() => tap(item)}
            style={({ pressed }) => [
              s.dhikrCard,
              finished && s.dhikrDone,
              pressed && s.pressed,
            ]}
          >
            {item.ref ? <Text style={s.dhikrTitle}>{item.ref.label}</Text> : null}
            <Text style={s.dhikrText}>{body}</Text>
            <Text style={[s.dhikrBadge, finished && s.dhikrBadgeDone]}>
              {finished
                ? '✓ تم'
                : `المتبقي: ${toArabicDigits(total - d)} من ${toArabicDigits(total)}`}
            </Text>
          </Pressable>
        );
      })}

      <Button
        title={mode === 'afterprayer' ? 'ابدأ من جديد (لصلاة تانية)' : 'إعادة البدء من الأول'}
        icon="refresh"
        variant="outline"
        style={{ marginTop: 8 }}
        onPress={resetMode}
      />
    </ScrollView>
  );
}

/* =====================================================
   السبحة
===================================================== */

const DHIKR_OPTIONS = [
  'سبحان الله',
  'الحمد لله',
  'الله أكبر',
  'لا إله إلا الله',
  'أستغفر الله',
];
const TARGETS = [33, 99, 100, 0];

function TasbeehScreen() {
  const { s } = useTheme();
  const [count, setCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [target, setTarget] = useState(33);
  const [dhikr, setDhikr] = useState(DHIKR_OPTIONS[0]);
  const [ready, setReady] = useState(false);
  const bump = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    load('tasbeeh', null).then((st) => {
      if (st) {
        setCount(st.count || 0);
        setTotal(st.total || 0);
        setTarget(typeof st.target === 'number' ? st.target : 33);
        setDhikr(st.dhikr || DHIKR_OPTIONS[0]);
      }
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (ready) save('tasbeeh', { count, total, target, dhikr });
  }, [count, total, target, dhikr, ready]);

  const doBump = () => {
    Animated.sequence([
      Animated.timing(bump, { toValue: 1.15, duration: 60, useNativeDriver: true }),
      Animated.spring(bump, { toValue: 1, friction: 4, useNativeDriver: true }),
    ]).start();
  };

  const onTap = () => {
    const nextCount = count + 1;
    setTotal(total + 1);
    doBump();
    if (target > 0 && nextCount >= target) {
      Vibration.vibrate(Platform.OS === 'android' ? [0, 200, 100, 200] : 400);
      setCount(0);
    } else {
      Vibration.vibrate(15);
      setCount(nextCount);
    }
  };

  return (
    <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <Header small="سبّح واذكر الله" title="السبحة" />

      <Text style={s.tasbeehTitle}>{dhikr}</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.chipsRow}
      >
        {DHIKR_OPTIONS.map((d) => (
          <Pressable
            key={d}
            onPress={() => {
              setDhikr(d);
              setCount(0);
            }}
            style={({ pressed }) => [s.chip, dhikr === d && s.chipOn, pressed && s.pressed]}
          >
            <Text style={[s.chipText, dhikr === d && s.chipTextOn]}>{d}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={s.tasbeehRing}>
        <Pressable
          onPress={onTap}
          accessibilityRole="button"
          accessibilityLabel={`${dhikr}، العدد ${toArabicDigits(count)}`}
          style={({ pressed }) => [s.tasbeehBtn, pressed && s.tasbeehBtnPressed]}
        >
          <Animated.Text style={[s.tasbeehCount, { transform: [{ scale: bump }] }]}>
            {toArabicDigits(count)}
          </Animated.Text>
          <Text style={s.tasbeehSub}>
            {target > 0 ? `من ${toArabicDigits(target)}` : 'بدون هدف'}
          </Text>
        </Pressable>
      </View>

      <View style={s.chipsRowCenter}>
        {TARGETS.map((tg) => (
          <Pressable
            key={tg}
            onPress={() => {
              setTarget(tg);
              setCount(0);
            }}
            style={({ pressed }) => [s.chip, target === tg && s.chipOn, pressed && s.pressed]}
          >
            <Text style={[s.chipText, target === tg && s.chipTextOn]}>
              {tg === 0 ? 'حر' : toArabicDigits(tg)}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={s.note}>إجمالي التسبيحات: {toArabicDigits(total)}</Text>

      <Button
        title="تصفير العدّاد"
        icon="refresh"
        variant="outline"
        style={{ marginTop: 16 }}
        onPress={() => {
          setCount(0);
          setTotal(0);
        }}
      />
    </ScrollView>
  );
}

/* =====================================================
   الإعدادات
===================================================== */

function CityPicker({ settings, onChange }) {
  const { s, t } = useTheme();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const city = CITIES.find((x) => x.id === settings.cityId) || CITIES[0];
  const nq = normalizeAr(q.trim().toLowerCase());
  const matches = nq
    ? CITIES.filter(
        (x) => normalizeAr(x.name).includes(nq) || normalizeAr(x.country).includes(nq)
      )
    : CITIES;
  const list = matches.slice(0, 12);

  return (
    <View style={{ marginBottom: 12 }}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={({ pressed }) => [s.optionRow, s.optionRowOn, pressed && s.pressed]}
      >
        <Text style={[s.optionText, s.optionTextOn]}>
          {city.name} — {city.country}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={t.primary} />
      </Pressable>

      {open ? (
        <View>
          <TextInput
            style={[s.input, { marginTop: 6 }]}
            value={q}
            onChangeText={setQ}
            placeholder="ابحث باسم المدينة أو الدولة..."
            placeholderTextColor={t.sub}
          />
          {list.map((x) => (
            <Pressable
              key={x.id}
              onPress={() => {
                onChange({ cityId: x.id, locationMode: 'manual' });
                setOpen(false);
                setQ('');
              }}
              style={({ pressed }) => [
                s.optionRow,
                x.id === settings.cityId && s.optionRowOn,
                pressed && s.pressed,
              ]}
            >
              <Text
                style={[s.optionText, x.id === settings.cityId && s.optionTextOn]}
              >
                {x.name}
              </Text>
              <Text style={s.note}>{x.country}</Text>
            </Pressable>
          ))}
          {list.length === 0 ? (
            <Text style={s.note}>مفيش مدينة بالاسم ده</Text>
          ) : null}
          {matches.length > list.length ? (
            <Text style={s.note}>اكتب اسم المدينة في البحث لإظهار باقي المدن</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function SettingsScreen({ settings, onChange, onBack }) {
  const { s, t } = useTheme();
  return (
    <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      {onBack ? <BackPill onBack={onBack} /> : null}
      <Header small="خصّص تطبيقك" title="الإعدادات" />

      <Text style={s.sectionTitle}>الموقع</Text>
      <View style={s.segment}>
        <Pressable
          style={({ pressed }) => [
            s.segBtn,
            settings.locationMode !== 'manual' && s.segBtnOn,
            pressed && s.pressed,
          ]}
          onPress={() => onChange({ locationMode: 'auto' })}
        >
          <Text style={[s.segText, settings.locationMode !== 'manual' && s.segTextOn]}>
            تلقائي (GPS)
          </Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            s.segBtn,
            settings.locationMode === 'manual' && s.segBtnOn,
            pressed && s.pressed,
          ]}
          onPress={() => onChange({ locationMode: 'manual' })}
        >
          <Text style={[s.segText, settings.locationMode === 'manual' && s.segTextOn]}>
            اختيار مدينة
          </Text>
        </Pressable>
      </View>
      {settings.locationMode === 'manual' ? (
        <CityPicker settings={settings} onChange={onChange} />
      ) : (
        <Text style={[s.note, { marginBottom: 8 }]}>
          بيستخدم موقعك الحالي ويتحدّث لما ترجع للتطبيق.
        </Text>
      )}

      <Text style={s.sectionTitle}>طريقة حساب المواقيت</Text>
      {METHODS.map(([key, label]) => {
        const on = settings.method === key;
        return (
          <Pressable
            key={key}
            onPress={() => onChange({ method: key })}
            style={({ pressed }) => [s.optionRow, on && s.optionRowOn, pressed && s.pressed]}
          >
            <Text style={[s.optionText, on && s.optionTextOn]}>{label}</Text>
            <Ionicons
              name={on ? 'radio-button-on' : 'radio-button-off'}
              size={20}
              color={on ? t.primary : t.sub}
            />
          </Pressable>
        );
      })}

      <Text style={s.sectionTitle}>المذهب (يؤثر على وقت العصر)</Text>
      <View style={s.segment}>
        <Pressable
          style={({ pressed }) => [
            s.segBtn,
            settings.madhab === 'shafi' && s.segBtnOn,
            pressed && s.pressed,
          ]}
          onPress={() => onChange({ madhab: 'shafi' })}
        >
          <Text style={[s.segText, settings.madhab === 'shafi' && s.segTextOn]}>
            الجمهور (شافعي/مالكي/حنبلي)
          </Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            s.segBtn,
            settings.madhab === 'hanafi' && s.segBtnOn,
            pressed && s.pressed,
          ]}
          onPress={() => onChange({ madhab: 'hanafi' })}
        >
          <Text style={[s.segText, settings.madhab === 'hanafi' && s.segTextOn]}>حنفي</Text>
        </Pressable>
      </View>

      <Text style={s.sectionTitle}>التنبيهات</Text>
      <View style={s.switchRow}>
        <Text style={s.optionText}>تنبيهات الأذان</Text>
        <Switch
          value={settings.notifications}
          onValueChange={(v) => onChange({ notifications: v })}
          trackColor={{ true: t.primary, false: t.border }}
          thumbColor="#fff"
        />
      </View>

      <View style={s.switchRow}>
        <Text style={s.optionText}>تذكير الجمعة (سورة الكهف)</Text>
        <Switch
          value={settings.fridayReminder !== false}
          onValueChange={(v) => onChange({ fridayReminder: v })}
          trackColor={{ true: t.primary, false: t.border }}
          thumbColor="#fff"
        />
      </View>

      <Text style={s.sectionTitle}>تنبيه قبل الأذان</Text>
      <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        {[0, 5, 10, 15, 20, 30].map((m) => {
          const on = (settings.preReminder || 0) === m;
          return (
            <Pressable
              key={m}
              onPress={() => onChange({ preReminder: m })}
              style={({ pressed }) => [s.chip, on && s.chipOn, pressed && s.pressed]}
            >
              <Text style={[s.chipText, on && s.chipTextOn]}>
                {m === 0 ? 'بدون' : `${toArabicDigits(m)} دقيقة`}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={[s.note, { marginBottom: 8 }]}>
        بيجيلك إشعار قبل كل أذان بالمدة اللي تختارها.
      </Text>

      <Text style={s.sectionTitle}>صوت التنبيه</Text>
      <View style={s.segment}>
        <Pressable
          style={({ pressed }) => [
            s.segBtn,
            settings.adhanSound !== 'custom' && s.segBtnOn,
            pressed && s.pressed,
          ]}
          onPress={() => onChange({ adhanSound: 'default' })}
        >
          <Text style={[s.segText, settings.adhanSound !== 'custom' && s.segTextOn]}>
            صوت الموبايل
          </Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            s.segBtn,
            settings.adhanSound === 'custom' && s.segBtnOn,
            pressed && s.pressed,
          ]}
          onPress={() => onChange({ adhanSound: 'custom' })}
        >
          <Text style={[s.segText, settings.adhanSound === 'custom' && s.segTextOn]}>
            صوت الأذان
          </Text>
        </Pressable>
      </View>
      {settings.adhanSound === 'custom' ? (
        <Text style={[s.note, { marginBottom: 8 }]}>
          جرّب الصوت من زرار "تجربة تنبيه" في شاشة المواقيت.
        </Text>
      ) : null}

      <Text style={s.sectionTitle}>ضبط دقائق الصلوات</Text>
      <Text style={[s.note, { marginBottom: 8 }]}>
        + بيؤخّر الوقت و − بيقدّمه (لحد ١٠ دقايق). مفيد لو مسجدك بيفرق عن الحساب.
      </Text>
      {FARD.map(([id, label]) => {
        const v = (settings.adjust && settings.adjust[id]) || 0;
        const setV = (nv) =>
          onChange({
            adjust: { ...(settings.adjust || {}), [id]: Math.max(-10, Math.min(10, nv)) },
          });
        return (
          <View key={id} style={s.optionRow}>
            <Text style={s.optionText}>{label}</Text>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10 }}>
              <Pressable
                style={({ pressed }) => [s.pill, pressed && s.pressed]}
                onPress={() => setV(v - 1)}
              >
                <Text style={s.pillText}>−</Text>
              </Pressable>
              <Text style={[s.optionText, { minWidth: 48, textAlign: 'center' }]}>
                {v === 0 ? '٠' : `${v > 0 ? '+' : '−'}${toArabicDigits(Math.abs(v))}`}
              </Text>
              <Pressable
                style={({ pressed }) => [s.pill, pressed && s.pressed]}
                onPress={() => setV(v + 1)}
              >
                <Text style={s.pillText}>+</Text>
              </Pressable>
            </View>
          </View>
        );
      })}
      <Button
        title="تصفير كل التعديلات"
        icon="refresh"
        variant="outline"
        style={{ marginTop: 6, marginBottom: 8 }}
        onPress={() =>
          onChange({ adjust: { fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 } })
        }
      />

      {Platform.OS === 'android' ? (
        <View>
          <Text style={s.sectionTitle}>ضمان وصول الأذان</Text>
          <Text style={[s.note, { textAlign: 'right', marginBottom: 8 }]}>
            لو الأذان بيتأخر أو مبيوصلش، استثنِ التطبيق من توفير البطارية.
          </Text>
          <Button
            title="فتح إعدادات البطارية"
            icon="battery-charging-outline"
            variant="soft"
            onPress={openBatterySettings}
          />
        </View>
      ) : null}

      <Text style={s.sectionTitle}>المظهر</Text>
      <View style={s.segment}>
        {[
          ['auto', 'تلقائي'],
          ['light', 'فاتح'],
          ['dark', 'داكن'],
        ].map(([k, l]) => (
          <Pressable
            key={k}
            style={({ pressed }) => [
              s.segBtn,
              settings.theme === k && s.segBtnOn,
              pressed && s.pressed,
            ]}
            onPress={() => onChange({ theme: k })}
          >
            <Text style={[s.segText, settings.theme === k && s.segTextOn]}>{l}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={s.sectionTitle}>تعديل التاريخ الهجري</Text>
      <View style={s.switchRow}>
        <Pressable
          style={({ pressed }) => [s.pill, pressed && s.pressed]}
          onPress={() =>
            onChange({ hijriOffset: Math.max(-2, (settings.hijriOffset || 0) - 1) })
          }
        >
          <Text style={s.pillText}>− يوم</Text>
        </Pressable>
        <Text style={s.optionText}>
          {settings.hijriOffset
            ? `${settings.hijriOffset > 0 ? '+' : '−'}${toArabicDigits(
                Math.abs(settings.hijriOffset)
              )} يوم`
            : 'بدون تعديل'}
        </Text>
        <Pressable
          style={({ pressed }) => [s.pill, pressed && s.pressed]}
          onPress={() =>
            onChange({ hijriOffset: Math.min(2, (settings.hijriOffset || 0) + 1) })
          }
        >
          <Text style={s.pillText}>+ يوم</Text>
        </Pressable>
      </View>

      <Text style={s.note}>
        التغييرات بتتحفظ تلقائيًا وبتتطبق على المواقيت والتنبيهات فورًا.
      </Text>
    </ScrollView>
  );
}

/* =====================================================
   مكونات شاشة "المزيد"
===================================================== */

function BackPill({ onBack, label = '→ المزيد' }) {
  const { s } = useTheme();
  return (
    <Pressable
      onPress={onBack}
      style={({ pressed }) => [
        s.pill,
        { alignSelf: 'flex-end', marginBottom: 12 },
        pressed && s.pressed,
      ]}
    >
      <Text style={s.pillText}>{label}</Text>
    </Pressable>
  );
}

/* =====================================================
   أسماء الله الحسنى
   القايمة المشهورة، وفي اختلافات بسيطة بين العلماء في العدّ.
===================================================== */

const ALLAH_NAMES = [
  'الرَّحْمَنُ', 'الرَّحِيمُ', 'الْمَلِكُ', 'الْقُدُّوسُ', 'السَّلَامُ', 'الْمُؤْمِنُ',
  'الْمُهَيْمِنُ', 'الْعَزِيزُ', 'الْجَبَّارُ', 'الْمُتَكَبِّرُ', 'الْخَالِقُ', 'الْبَارِئُ',
  'الْمُصَوِّرُ', 'الْغَفَّارُ', 'الْقَهَّارُ', 'الْوَهَّابُ', 'الرَّزَّاقُ', 'الْفَتَّاحُ',
  'الْعَلِيمُ', 'الْقَابِضُ', 'الْبَاسِطُ', 'الْخَافِضُ', 'الرَّافِعُ', 'الْمُعِزُّ',
  'الْمُذِلُّ', 'السَّمِيعُ', 'الْبَصِيرُ', 'الْحَكَمُ', 'الْعَدْلُ', 'اللَّطِيفُ',
  'الْخَبِيرُ', 'الْحَلِيمُ', 'الْعَظِيمُ', 'الْغَفُورُ', 'الشَّكُورُ', 'الْعَلِيُّ',
  'الْكَبِيرُ', 'الْحَفِيظُ', 'الْمُقِيتُ', 'الْحَسِيبُ', 'الْجَلِيلُ', 'الْكَرِيمُ',
  'الرَّقِيبُ', 'الْمُجِيبُ', 'الْوَاسِعُ', 'الْحَكِيمُ', 'الْوَدُودُ', 'الْمَجِيدُ',
  'الْبَاعِثُ', 'الشَّهِيدُ', 'الْحَقُّ', 'الْوَكِيلُ', 'الْقَوِيُّ', 'الْمَتِينُ',
  'الْوَلِيُّ', 'الْحَمِيدُ', 'الْمُحْصِي', 'الْمُبْدِئُ', 'الْمُعِيدُ', 'الْمُحْيِي',
  'الْمُمِيتُ', 'الْحَيُّ', 'الْقَيُّومُ', 'الْوَاجِدُ', 'الْمَاجِدُ', 'الْوَاحِدُ',
  'الْأَحَدُ', 'الصَّمَدُ', 'الْقَادِرُ', 'الْمُقْتَدِرُ', 'الْمُقَدِّمُ', 'الْمُؤَخِّرُ',
  'الْأَوَّلُ', 'الْآخِرُ', 'الظَّاهِرُ', 'الْبَاطِنُ', 'الْوَالِي', 'الْمُتَعَالِي',
  'الْبَرُّ', 'التَّوَّابُ', 'الْمُنْتَقِمُ', 'الْعَفُوُّ', 'الرَّؤُوفُ', 'مَالِكُ الْمُلْكِ',
  'ذُو الْجَلَالِ وَالْإِكْرَامِ', 'الْمُقْسِطُ', 'الْجَامِعُ', 'الْغَنِيُّ', 'الْمُغْنِي',
  'الْمَانِعُ', 'الضَّارُّ', 'النَّافِعُ', 'النُّورُ', 'الْهَادِي', 'الْبَدِيعُ',
  'الْبَاقِي', 'الْوَارِثُ', 'الرَّشِيدُ', 'الصَّبُورُ',
];

function NamesScreen({ onBack }) {
  const { s, t } = useTheme();
  const [memo, setMemo] = useState([]);
  const [ready, setReady] = useState(false);
  const [filter, setFilter] = useState('all'); // all | memo | todo

  useEffect(() => {
    load('names:memo', []).then((m) => {
      setMemo(Array.isArray(m) ? m : []);
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (ready) save('names:memo', memo);
  }, [memo, ready]);

  const toggle = (n) => {
    Vibration.vibrate(10);
    setMemo((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]));
  };

  const data = ALLAH_NAMES.map((name, i) => ({ n: i + 1, name })).filter((x) =>
    filter === 'all' ? true : filter === 'memo' ? memo.includes(x.n) : !memo.includes(x.n)
  );

  const total = ALLAH_NAMES.length;

  return (
    <FlatList
      data={data}
      keyExtractor={(x) => String(x.n)}
      contentContainerStyle={s.content}
      showsVerticalScrollIndicator={false}
      initialNumToRender={20}
      ListHeaderComponent={
        <View>
          <BackPill onBack={onBack} />
          <Header small="لله الأسماء الحسنى" title="أسماء الله الحسنى" />

          <Text style={[s.note, { textAlign: 'right' }]}>
            حفظت {toArabicDigits(memo.length)} من {toArabicDigits(total)}
          </Text>
          <View style={[s.progressTrack, { marginBottom: 12 }]}>
            <View style={[s.progressFill, { width: `${(memo.length / total) * 100}%` }]} />
          </View>

          <View style={s.segment}>
            {[
              ['all', 'الكل'],
              ['todo', 'لسه'],
              ['memo', 'محفوظ'],
            ].map(([k, l]) => (
              <Pressable
                key={k}
                style={({ pressed }) => [s.segBtn, filter === k && s.segBtnOn, pressed && s.pressed]}
                onPress={() => setFilter(k)}
              >
                <Text style={[s.segText, filter === k && s.segTextOn]}>{l}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={s.hintText}>اضغط على الاسم لتعليمه "محفوظ"</Text>
        </View>
      }
      ListEmptyComponent={<Text style={s.note}>مفيش أسماء في القسم ده</Text>}
      renderItem={({ item }) => {
        const done = memo.includes(item.n);
        return (
          <Pressable
            onPress={() => toggle(item.n)}
            style={({ pressed }) => [
              s.surahRow,
              done && { backgroundColor: t.done, borderColor: t.doneBorder },
              pressed && s.pressed,
            ]}
          >
            <View style={s.surahNum}>
              <Text style={s.surahNumText}>{toArabicDigits(item.n)}</Text>
            </View>
            <View style={s.surahInfo}>
              <Text style={[s.surahName, { fontFamily: F.quranBold, fontSize: 22 }]}>
                {item.name}
              </Text>
            </View>
            <Ionicons
              name={done ? 'checkmark-circle' : 'ellipse-outline'}
              size={24}
              color={done ? t.primary : t.sub}
            />
          </Pressable>
        );
      }}
    />
  );
}

/* =====================================================
   حاسبة الزكاة
   حساب تقريبي (٢٫٥٪ لو بلغ المال النصاب). الأسعار بتدخلها بنفسك
   لأنها بتتغير كل يوم.
===================================================== */

function parseNum(v) {
  const latin = String(v || '')
    .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/٫/g, '.')
    .replace(/[،,]/g, '');
  const n = parseFloat(latin.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function fmtMoney(n) {
  const r = Math.round(n * 100) / 100;
  const [i, d] = String(r).split('.');
  return toArabicDigits(i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (d ? '.' + d : ''));
}

const ZAKAT_EMPTY = {
  cash: '',
  goldG: '',
  goldPrice: '',
  silverG: '',
  silverPrice: '',
  trade: '',
  owed: '',
  debts: '',
};

function ZakatScreen({ onBack }) {
  const { s, t } = useTheme();
  const [f, setF] = useState(ZAKAT_EMPTY);
  const [karat, setKarat] = useState(21);
  const [basis, setBasis] = useState('gold'); // gold | silver
  const [ready, setReady] = useState(false);

  useEffect(() => {
    load('zakat', null).then((st) => {
      if (st) {
        setF({ ...ZAKAT_EMPTY, ...(st.f || {}) });
        if (st.karat) setKarat(st.karat);
        if (st.basis) setBasis(st.basis);
      }
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (ready) save('zakat', { f, karat, basis });
  }, [f, karat, basis, ready]);

  const set = (k) => (v) => setF((prev) => ({ ...prev, [k]: v }));

  const goldVal = (parseNum(f.goldG) * karat * parseNum(f.goldPrice)) / 24;
  const silverVal = parseNum(f.silverG) * parseNum(f.silverPrice);
  const total =
    parseNum(f.cash) +
    goldVal +
    silverVal +
    parseNum(f.trade) +
    parseNum(f.owed) -
    parseNum(f.debts);
  const base = Math.max(0, total);
  const nisab = basis === 'gold' ? 85 * parseNum(f.goldPrice) : 595 * parseNum(f.silverPrice);
  const hasNisab = nisab > 0;
  const reached = hasNisab && base >= nisab;
  const zakat = reached ? base * 0.025 : 0;

  // دالة عادية (مش component) عشان الـ TextInput ميفقدش الفوكس مع كل حرف
  const field = (label, k, hint) => (
    <View key={k} style={{ marginBottom: 4 }}>
      <Text style={[s.optionText, { textAlign: 'right', marginBottom: 6 }]}>{label}</Text>
      <TextInput
        style={s.input}
        value={f[k]}
        onChangeText={set(k)}
        keyboardType="decimal-pad"
        placeholder={hint || '٠'}
        placeholderTextColor={t.sub}
      />
    </View>
  );

  return (
    <ScrollView
      contentContainerStyle={s.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <BackPill onBack={onBack} />
      <Header small="زكّ مالك" title="حاسبة الزكاة" />

      <Text style={s.sectionTitle}>النصاب يتحسب بـ</Text>
      <View style={s.segment}>
        <Pressable
          style={({ pressed }) => [s.segBtn, basis === 'gold' && s.segBtnOn, pressed && s.pressed]}
          onPress={() => setBasis('gold')}
        >
          <Text style={[s.segText, basis === 'gold' && s.segTextOn]}>الذهب (٨٥ جم)</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [s.segBtn, basis === 'silver' && s.segBtnOn, pressed && s.pressed]}
          onPress={() => setBasis('silver')}
        >
          <Text style={[s.segText, basis === 'silver' && s.segTextOn]}>الفضة (٥٩٥ جم)</Text>
        </Pressable>
      </View>

      <Text style={s.sectionTitle}>الأسعار (بعملتك)</Text>
      {field('سعر جرام الذهب عيار ٢٤', 'goldPrice')}
      {field('سعر جرام الفضة', 'silverPrice')}

      <Text style={s.sectionTitle}>ما تملكه</Text>
      {field('النقد والمدخرات', 'cash')}
      <Text style={[s.optionText, { textAlign: 'right', marginBottom: 6 }]}>عيار الذهب اللي معاك</Text>
      <View style={{ flexDirection: 'row-reverse', gap: 8, marginBottom: 12 }}>
        {[24, 21, 18].map((k) => (
          <Pressable
            key={k}
            onPress={() => setKarat(k)}
            style={({ pressed }) => [s.chip, karat === k && s.chipOn, pressed && s.pressed]}
          >
            <Text style={[s.chipText, karat === k && s.chipTextOn]}>{toArabicDigits(k)}</Text>
          </Pressable>
        ))}
      </View>
      {field('الذهب (بالجرام)', 'goldG')}
      {field('الفضة (بالجرام)', 'silverG')}
      {field('عروض التجارة (قيمة البضاعة)', 'trade')}
      {field('ديون ليك مرجوّة السداد', 'owed')}

      <Text style={s.sectionTitle}>ما عليك</Text>
      {field('ديون عليك حالّة (مستحقة الآن)', 'debts')}

      <View style={[s.card, { marginTop: 8, alignItems: 'stretch' }]}>
        <Text style={[s.cardTitle, { textAlign: 'right', marginBottom: 10 }]}>النتيجة</Text>
        <Text style={[s.optionText, { textAlign: 'right' }]}>
          إجمالي المال الخاضع للزكاة: {fmtMoney(base)}
        </Text>
        <Text style={[s.optionText, { textAlign: 'right', marginTop: 6 }]}>
          النصاب: {hasNisab ? fmtMoney(nisab) : '— أدخل سعر الجرام'}
        </Text>
        <Text
          style={[
            s.cardTitle,
            { textAlign: 'right', marginTop: 14, marginBottom: 0, color: reached ? t.primary : t.sub },
          ]}
        >
          {!hasNisab
            ? 'أدخل سعر الجرام لحساب النصاب'
            : reached
            ? `الزكاة الواجبة: ${fmtMoney(zakat)}`
            : 'المال لم يبلغ النصاب، فلا زكاة'}
        </Text>
      </View>

      <Text style={[s.note, { marginTop: 12 }]}>
        الزكاة (٢٫٥٪) بتجب لما المال يبلغ النصاب ويمر عليه سنة هجرية كاملة. ده حساب تقريبي، ولو عندك
        حالة خاصة (أسهم، عقار للإيجار، دين متأخر...) اسأل جهة الفتوى المعتمدة عندك.
      </Text>

      <Button
        title="مسح كل الخانات"
        icon="refresh"
        variant="outline"
        style={{ marginTop: 12 }}
        onPress={() => setF(ZAKAT_EMPTY)}
      />
    </ScrollView>
  );
}

/* =====================================================
   شاشة المزيد
===================================================== */

function MoreScreen({ active, settings, onChange }) {
  const { s, t } = useTheme();
  const [sub, setSub] = useState(null); // null | names | zakat | settings

  useEffect(() => {
    if (!active || !sub) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setSub(null);
      return true;
    });
    return () => subscription.remove();
  }, [active, sub]);

  const back = () => setSub(null);

  if (sub === 'names') return <NamesScreen onBack={back} />;
  if (sub === 'zakat') return <ZakatScreen onBack={back} />;
  if (sub === 'settings') {
    return <SettingsScreen settings={settings} onChange={onChange} onBack={back} />;
  }

  const items = [
    ['names', 'sparkles-outline', 'أسماء الله الحسنى', 'تصفّح وتتبّع حفظك'],
    ['zakat', 'calculator-outline', 'حاسبة الزكاة', 'احسب زكاة مالك'],
    ['settings', 'settings-outline', 'الإعدادات', 'المواقيت والتنبيهات والمظهر'],
  ];

  return (
    <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <Header small="كل ما تحتاجه" title="المزيد" />
      {items.map(([k, icon, title, subtitle]) => (
        <Pressable
          key={k}
          onPress={() => setSub(k)}
          style={({ pressed }) => [s.surahRow, pressed && s.pressed]}
        >
          <View style={s.surahNum}>
            <Ionicons name={icon} size={22} color={t.primary} />
          </View>
          <View style={s.surahInfo}>
            <Text style={s.surahName}>{title}</Text>
            <Text style={s.surahMeta}>{subtitle}</Text>
          </View>
          <Ionicons name="chevron-back" size={20} color={t.sub} />
        </Pressable>
      ))}
    </ScrollView>
  );
}

/* =====================================================
   شاشة البداية (Splash) + التعريف (Onboarding)
===================================================== */

const BRAND = ['#0A4436', '#0F5C4A', '#17806A'];

const ob = StyleSheet.create({
  fill: { flex: 1 },
  splashCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  ringOuter: {
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 1.5,
    borderColor: 'rgba(240,207,122,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },
  ringInner: {
    width: 118,
    height: 118,
    borderRadius: 59,
    borderWidth: 2,
    borderColor: '#F0CF7A',
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashTitle: { fontSize: 36, color: '#fff', fontFamily: F.bold },
  splashSub: { fontSize: 15, color: '#F0CF7A', marginTop: 4, fontFamily: F.reg },
  bgCircleA: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    borderWidth: 1.5,
    borderColor: 'rgba(240,207,122,0.12)',
    top: -120,
    right: -100,
  },
  bgCircleB: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.08)',
    bottom: -90,
    left: -80,
  },
  page: { flex: 1, padding: 28, paddingTop: TOP + 8 },
  skip: { color: '#fff', opacity: 0.8, fontSize: 15, fontFamily: F.semi },
  iconCircle: {
    width: 168,
    height: 168,
    borderRadius: 84,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1.5,
    borderColor: 'rgba(240,207,122,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 34,
  },
  title: { fontSize: 28, color: '#fff', textAlign: 'center', fontFamily: F.bold },
  text: {
    fontSize: 16,
    color: '#fff',
    opacity: 0.85,
    textAlign: 'center',
    lineHeight: 28,
    marginTop: 12,
    paddingHorizontal: 12,
    fontFamily: F.reg,
  },
  dots: { flexDirection: 'row-reverse', justifyContent: 'center', gap: 8, marginBottom: 22 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.35)' },
  dotOn: { width: 26, backgroundColor: '#F0CF7A' },
  cta: {
    backgroundColor: '#F0CF7A',
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: Platform.OS === 'ios' ? 20 : 12,
  },
  ctaText: { color: '#0A4436', fontSize: 18, fontFamily: F.bold },
});

function AnimatedSplash({ onDone }) {
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.85)).current;
  const out = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(fade, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, friction: 6, useNativeDriver: true }),
      ]),
      Animated.delay(800),
      Animated.timing(out, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start(() => onDone());
  }, []);

  return (
    <Animated.View style={[ob.fill, { opacity: out }]}>
      <StatusBar barStyle="light-content" backgroundColor="#0A4436" />
      <LinearGradient colors={BRAND} style={ob.splashCenter}>
        <View style={ob.bgCircleA} />
        <View style={ob.bgCircleB} />
        <Animated.View style={{ opacity: fade, transform: [{ scale }], alignItems: 'center' }}>
          <View style={ob.ringOuter}>
            <View style={ob.ringInner}>
              <Ionicons name="moon" size={52} color="#F0CF7A" />
            </View>
          </View>
          <Text style={ob.splashTitle}>{APP_NAME}</Text>
          <Text style={ob.splashSub}>{APP_TAGLINE}</Text>
        </Animated.View>
      </LinearGradient>
    </Animated.View>
  );
}

const SLIDES = [
  {
    icon: 'time-outline',
    title: 'مواقيت دقيقة',
    text: 'مواقيت الصلاة حسب موقعك، مع عدّاد للصلاة القادمة وتنبيه بالأذان.',
  },
  {
    icon: 'book-outline',
    title: 'المصحف والأذكار',
    text: 'اقرأ القرآن واحفظ علاماتك، وحصّن يومك بأذكار الصباح والمساء والنوم.',
  },
  {
    icon: 'notifications-outline',
    title: 'خلّينا نفكّرك',
    text: 'اسمح بالموقع والإشعارات عشان توصلك تنبيهات الأذان في وقتها بالظبط.',
  },
];

function Onboarding({ onFinish }) {
  const [i, setI] = useState(0);
  const fade = useRef(new Animated.Value(0)).current;
  const last = i === SLIDES.length - 1;
  const slide = SLIDES[i];

  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 380, useNativeDriver: true }).start();
  }, [i]);

  const next = async () => {
    if (!last) {
      setI(i + 1);
      return;
    }
    try {
      await Location.requestForegroundPermissionsAsync();
      await ensureChannelAndPermission(); // بيعمل القنوات الأول ثم يطلب الإذن
    } catch (e) {}
    onFinish();
  };

  return (
    <LinearGradient colors={BRAND} style={ob.page}>
      <StatusBar barStyle="light-content" backgroundColor="#0A4436" />
      <View style={ob.bgCircleA} />
      <View style={ob.bgCircleB} />

      <Pressable onPress={onFinish} style={{ alignSelf: 'flex-start' }} hitSlop={12}>
        <Text style={ob.skip}>تخطي</Text>
      </Pressable>

      <Animated.View
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', opacity: fade }}
      >
        <View style={ob.iconCircle}>
          <Ionicons name={slide.icon} size={76} color="#F0CF7A" />
        </View>
        <Text style={ob.title}>{slide.title}</Text>
        <Text style={ob.text}>{slide.text}</Text>
      </Animated.View>

      <View style={ob.dots}>
        {SLIDES.map((_, k) => (
          <View key={k} style={[ob.dot, k === i && ob.dotOn]} />
        ))}
      </View>

      <Pressable onPress={next} style={({ pressed }) => [ob.cta, pressed && { opacity: 0.85 }]}>
        <Text style={ob.ctaText}>{last ? 'ابدأ الآن' : 'التالي'}</Text>
      </Pressable>
    </LinearGradient>
  );
}

/* =====================================================
   التطبيق الرئيسي + شريط التبويبات
===================================================== */

// [الاسم، أيقونة نشطة، أيقونة عادية، العنوان]
const TABS = [
  ['prayer', 'time', 'time-outline', 'المواقيت'],
  ['quran', 'book', 'book-outline', 'المصحف'],
  ['adhkar', 'sparkles', 'sparkles-outline', 'الأذكار'],
  ['tasbeeh', 'finger-print', 'finger-print-outline', 'السبحة'],
  ['more', 'grid', 'grid-outline', 'المزيد'],
];

/* =====================================================
   حاجز الأخطاء: بدل شاشة بيضا لو حصل كراش، بنعرض رسالة وزرار إعادة محاولة
===================================================== */

const eb = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: '#0A4436',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  title: { fontSize: 22, color: '#fff', textAlign: 'center', marginBottom: 10 },
  msg: { fontSize: 13, color: '#F0CF7A', textAlign: 'center', marginBottom: 20 },
  btn: {
    backgroundColor: '#F0CF7A',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 28,
  },
  btnText: { color: '#0A4436', fontSize: 16, fontWeight: '700' },
});

class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('App crashed:', error, info && info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={eb.wrap}>
        <Text style={eb.title}>حصلت مشكلة غير متوقعة</Text>
        <Text style={eb.msg}>{String(this.state.error && this.state.error.message)}</Text>
        <Pressable style={eb.btn} onPress={() => this.setState({ error: null })}>
          <Text style={eb.btnText}>إعادة المحاولة</Text>
        </Pressable>
      </View>
    );
  }
}

function MainApp() {
  const scheme = useColorScheme();
  const [tab, setTab] = useState('prayer');
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [quranJump, setQuranJump] = useState(null);

  // فتح سورة في المصحف من أي شاشة
  const openSurahFromAnywhere = (n, name) => {
    setQuranJump({ n, name, t: Date.now() });
    setTab('quran');
  };

  const isDark =
    settings.theme === 'dark' || (settings.theme !== 'light' && scheme === 'dark');
  const t = isDark ? DARK : LIGHT;
  const s = useMemo(() => makeStyles(t), [t]);

  useEffect(() => {
    load('settings', DEFAULT_SETTINGS).then((st) => {
      const saved = st && typeof st === 'object' ? st : {};
      setSettings({
        ...DEFAULT_SETTINGS,
        ...saved,
        adjust: { ...DEFAULT_SETTINGS.adjust, ...(saved.adjust || {}) },
      });
      setLoaded(true);
    });
  }, []);

  // الحفظ تلقائي بعد أي تغيير (بعد ما الإعدادات القديمة تتحمّل)
  useEffect(() => {
    if (loaded) save('settings', settings);
  }, [settings, loaded]);

  const updateSettings = (patch) => setSettings((prev) => ({ ...prev, ...patch }));

  const show = (name) => ({ flex: 1, display: tab === name ? 'flex' : 'none' });

  return (
    <Ctx.Provider value={{ t, s }}>
      <StatusBar
        barStyle={t.dark ? 'light-content' : 'dark-content'}
        backgroundColor={t.bg}
      />
      <SafeAreaView style={s.container}>
        {!loaded ? (
          <View style={[{ flex: 1 }, s.center]}>
            <Text style={s.note}>جاري التحميل...</Text>
          </View>
        ) : (
          <>
            <View style={show('prayer')}>
              <PrayerScreen
                active={tab === 'prayer'}
                settings={settings}
                onOpenSurah={openSurahFromAnywhere}
              />
            </View>
            <View style={show('quran')}>
              <QuranScreen active={tab === 'quran'} jump={quranJump} />
            </View>
            <View style={show('adhkar')}>
              <AdhkarScreen />
            </View>
            <View style={show('tasbeeh')}>
              <TasbeehScreen />
            </View>
            <View style={show('more')}>
              <MoreScreen
                active={tab === 'more'}
                settings={settings}
                onChange={updateSettings}
              />
            </View>

            <View style={s.tabBar}>
              {TABS.map(([name, iconOn, iconOff, label]) => {
                const on = tab === name;
                return (
                  <Pressable
                    key={name}
                    accessibilityRole="tab"
                    accessibilityLabel={label}
                    accessibilityState={{ selected: on }}
                    style={({ pressed }) => [s.tabItem, on && s.tabItemOn, pressed && s.pressed]}
                    onPress={() => setTab(name)}
                  >
                    <Ionicons
                      name={on ? iconOn : iconOff}
                      size={22}
                      color={on ? t.primary : t.sub}
                    />
                    <Text style={[s.tabLabel, on && s.tabLabelOn]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
      </SafeAreaView>
    </Ctx.Provider>
  );
}

function AppRoot() {
  const [fontsLoaded, fontError] = useFonts({
    Cairo_400Regular,
    Cairo_600SemiBold,
    Cairo_800ExtraBold,
    Amiri_400Regular,
    Amiri_700Bold,
  });
  const [stage, setStage] = useState('splash'); // splash | onboarding | app
  const [onboarded, setOnboarded] = useState(true);

  useEffect(() => {
    load('onboarded', false).then((v) => setOnboarded(!!v));
  }, []);

  const finishOnboarding = () => {
    save('onboarded', true);
    setStage('app');
  };

  // لو الخط فشل نكمّل بالخط الافتراضي بدل شاشة بيضا للأبد
  if (!fontsLoaded && !fontError) return null;

  if (stage === 'splash') {
    return <AnimatedSplash onDone={() => setStage(onboarded ? 'app' : 'onboarding')} />;
  }
  if (stage === 'onboarding') return <Onboarding onFinish={finishOnboarding} />;

  return <MainApp />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppRoot />
    </ErrorBoundary>
  );
}