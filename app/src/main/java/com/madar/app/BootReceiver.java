package com.madar.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** After the device restarts: Madar is reachable again (wake / remote) without opening the app. */
public class BootReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context c, Intent i) {
        if (!KeepService.prefs(c).getString("code", "").isEmpty()) KeepService.start(c);
    }
}
