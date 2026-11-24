package com.madar.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** After the device restarts, after an update, or nudged by DriveCast: Madar is reachable (wake / remote) without opening the app. */
public class BootReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context c, Intent i) {
        // never opened yet (a box set up over adb, e.g. by DriveCast): Madar gives itself a code and a name, so «أيقظ أجهزة مدار»
        // (fit/tv) reaches it at once; the page keeps or replaces them the first time it opens
        if (KeepService.prefs(c).getString("code", "").isEmpty())
            KeepService.setIdentity(c, String.valueOf(100000 + new java.security.SecureRandom().nextInt(900000)), android.os.Build.MODEL);
        else KeepService.start(c);
    }
}
