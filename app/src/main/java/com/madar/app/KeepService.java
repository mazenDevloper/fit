package com.madar.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

/** Keeps Madar running in the background (TV box, tablet): the remote / Madar can reach it at any time. */
public class KeepService extends Service {
    static volatile boolean running;
    @Override public int onStartCommand(Intent i, int f, int id) {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm.getNotificationChannel("keep") == null) nm.createNotificationChannel(new NotificationChannel("keep", "مدار في الخلفية", NotificationManager.IMPORTANCE_MIN));
        PendingIntent pi = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE);
        Notification n = new Notification.Builder(this, "keep").setContentTitle("مدار يعمل").setContentText("جاهز للتحكم عن بُعد").setSmallIcon(R.drawable.ic_notif).setContentIntent(pi).setOngoing(true).build();
        if (Build.VERSION.SDK_INT >= 34) startForeground(7, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE); else startForeground(7, n);
        running = true;
        return START_STICKY;
    }
    @Override public void onDestroy() { running = false; super.onDestroy(); }
    @Override public IBinder onBind(Intent i) { return null; }
}
