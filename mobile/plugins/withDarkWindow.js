const {
  AndroidConfig,
  withAndroidColors,
  withAndroidColorsNight,
  withAndroidStyles,
} = require('@expo/config-plugins');

const WINDOW_BG = '#0A0A0F';

function setColor(colors, name, value) {
  return AndroidConfig.Colors.assignColorValue(colors, { name, value });
}

function setStyle(styles, name, value) {
  return AndroidConfig.Styles.assignStylesValue(styles, {
    add: true,
    parent: AndroidConfig.Styles.getAppThemeGroup(),
    name,
    value,
  });
}

/**
 * Keep the Android window / fragment behind React Native dark.
 * DayNight + missing windowBackground is what flashes gray/white during
 * swipe-back and screen detach on Android.
 */
function withDarkWindow(config) {
  config = withAndroidColors(config, (cfg) => {
    cfg.modResults = setColor(cfg.modResults, 'activityBackground', WINDOW_BG);
    cfg.modResults = setColor(cfg.modResults, 'splashscreen_background', WINDOW_BG);
    return cfg;
  });

  config = withAndroidColorsNight(config, (cfg) => {
    cfg.modResults = setColor(cfg.modResults, 'activityBackground', WINDOW_BG);
    cfg.modResults = setColor(cfg.modResults, 'splashscreen_background', WINDOW_BG);
    cfg.modResults = setColor(cfg.modResults, 'iconBackground', WINDOW_BG);
    cfg.modResults = setColor(cfg.modResults, 'colorPrimaryDark', WINDOW_BG);
    return cfg;
  });

  config = withAndroidStyles(config, (cfg) => {
    const group = AndroidConfig.Styles.getAppThemeGroup();
    const appTheme = AndroidConfig.Styles.getStyleParent(cfg.modResults, group);
    if (appTheme?.$) {
      const parent = String(appTheme.$.parent || '');
      if (parent.includes('DayNight') || parent.includes('Light')) {
        // Theme.AppCompat.NoActionBar is dark; DayNight follows the phone
        // light theme and paints a gray/white window during transitions.
        appTheme.$.parent = 'Theme.AppCompat.NoActionBar';
      }
    }

    let styles = cfg.modResults;
    styles = setStyle(styles, 'android:windowBackground', '@color/activityBackground');
    styles = setStyle(styles, 'android:colorBackground', '@color/activityBackground');
    styles = setStyle(styles, 'android:navigationBarColor', '@color/activityBackground');
    styles = setStyle(styles, 'android:statusBarColor', '@color/activityBackground');
    styles = setStyle(styles, 'android:windowLightStatusBar', 'false');
    styles = setStyle(styles, 'android:windowLightNavigationBar', 'false');
    styles = setStyle(styles, 'android:forceDarkAllowed', 'false');
    cfg.modResults = styles;
    return cfg;
  });

  return config;
}

module.exports = withDarkWindow;
