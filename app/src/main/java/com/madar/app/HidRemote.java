package com.madar.app;

import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothHidDevice;
import android.bluetooth.BluetoothHidDeviceAppSdpSettings;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.content.Context;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.concurrent.Executors;

/**
 * The phone becomes a Bluetooth keyboard + TV remote (HID device, Android 9+): pair it once with any TV box,
 * Android TV, smart TV or computer, then the arrows / OK / back / home / play / volume and typing go to it -
 * nothing to install on the other side, no network needed.
 */
@SuppressLint("MissingPermission")
final class HidRemote {
    // report 1: keyboard (modifier, reserved, 6 keys) · report 2: consumer control (16-bit usage)
    private static final byte[] DESC = {
        0x05, 0x01, 0x09, 0x06, (byte) 0xA1, 0x01, (byte) 0x85, 0x01,
        0x05, 0x07, 0x19, (byte) 0xE0, 0x29, (byte) 0xE7, 0x15, 0x00, 0x25, 0x01, 0x75, 0x01, (byte) 0x95, 0x08, (byte) 0x81, 0x02,
        (byte) 0x95, 0x01, 0x75, 0x08, (byte) 0x81, 0x01,
        (byte) 0x95, 0x06, 0x75, 0x08, 0x15, 0x00, 0x25, 0x65, 0x05, 0x07, 0x19, 0x00, 0x29, 0x65, (byte) 0x81, 0x00,
        (byte) 0xC0,
        0x05, 0x0C, 0x09, 0x01, (byte) 0xA1, 0x01, (byte) 0x85, 0x02,
        0x15, 0x00, 0x26, (byte) 0xFF, 0x03, 0x19, 0x00, 0x2A, (byte) 0xFF, 0x03, 0x75, 0x10, (byte) 0x95, 0x01, (byte) 0x81, 0x00,
        (byte) 0xC0
    };
    private final Context ctx;
    private BluetoothHidDevice hid;
    private BluetoothDevice host;
    private boolean registered;
    private final Handler main = new Handler(Looper.getMainLooper());
    String state = "off";

    HidRemote(Context c) { ctx = c.getApplicationContext(); }
    static boolean supported() { return Build.VERSION.SDK_INT >= 28; }
    private BluetoothAdapter adapter() { BluetoothManager m = (BluetoothManager) ctx.getSystemService(Context.BLUETOOTH_SERVICE); return m == null ? null : m.getAdapter(); }

    void start() {
        if (!supported() || hid != null) return;
        BluetoothAdapter a = adapter(); if (a == null) { state = "no bluetooth"; return; }
        a.getProfileProxy(ctx, new BluetoothProfile.ServiceListener() {
            @Override public void onServiceConnected(int p, BluetoothProfile proxy) {
                hid = (BluetoothHidDevice) proxy;
                BluetoothHidDeviceAppSdpSettings sdp = new BluetoothHidDeviceAppSdpSettings("Madar Remote", "Madar", "Madar", BluetoothHidDevice.SUBCLASS1_COMBO, DESC);
                hid.registerApp(sdp, null, null, Executors.newSingleThreadExecutor(), new BluetoothHidDevice.Callback() {
                    @Override public void onAppStatusChanged(BluetoothDevice d, boolean reg) { registered = reg; state = reg ? "ready" : "off"; }
                    @Override public void onConnectionStateChanged(BluetoothDevice d, int st) {
                        if (st == BluetoothProfile.STATE_CONNECTED) { host = d; state = "connected: " + d.getName(); }
                        else if (st == BluetoothProfile.STATE_DISCONNECTED && d.equals(host)) { host = null; state = "ready"; }
                    }
                });
            }
            @Override public void onServiceDisconnected(int p) { hid = null; registered = false; state = "off"; }
        }, BluetoothProfile.HID_DEVICE);
    }
    String devices() {
        JSONArray out = new JSONArray();
        try { BluetoothAdapter a = adapter(); if (a != null) for (BluetoothDevice d : a.getBondedDevices()) out.put(new JSONObject().put("addr", d.getAddress()).put("name", d.getName())); } catch (Exception ignored) { }
        return out.toString();
    }
    void connect(String addr) {
        try { BluetoothAdapter a = adapter(); if (hid != null && a != null) hid.connect(a.getRemoteDevice(addr)); } catch (Exception ignored) { }
    }
    // ---- keys
    private void kb(int mod, int code) {
        if (hid == null || host == null) return;
        hid.sendReport(host, 1, new byte[]{(byte) mod, 0, (byte) code, 0, 0, 0, 0, 0});
        main.postDelayed(() -> { if (hid != null && host != null) hid.sendReport(host, 1, new byte[8]); }, 30);
    }
    private void cc(int usage) {
        if (hid == null || host == null) return;
        hid.sendReport(host, 2, new byte[]{(byte) usage, (byte) (usage >> 8)});
        main.postDelayed(() -> { if (hid != null && host != null) hid.sendReport(host, 2, new byte[]{0, 0}); }, 40);
    }
    void key(String k) {
        switch (k) {
            case "up": kb(0, 0x52); break; case "down": kb(0, 0x51); break; case "left": kb(0, 0x50); break; case "right": kb(0, 0x4F); break;
            case "ok": kb(0, 0x28); break;                 // Enter = OK / select
            case "back": cc(0x224); break;                 // AC Back
            case "home": cc(0x223); break;                 // AC Home
            case "menu": kb(0, 0x65); break;               // Application / menu
            case "play": cc(0xCD); break; case "next": cc(0xB5); break; case "prev": cc(0xB6); break;
            case "vol+": cc(0xE9); break; case "vol-": cc(0xEA); break; case "mute": cc(0xE2); break;
            default: break;
        }
    }
    void text(String s) {
        for (char ch : s.toCharArray()) {
            int code = 0, mod = 0;
            if (ch >= 'a' && ch <= 'z') code = 0x04 + (ch - 'a');
            else if (ch >= 'A' && ch <= 'Z') { code = 0x04 + (ch - 'A'); mod = 0x02; }
            else if (ch >= '1' && ch <= '9') code = 0x1E + (ch - '1');
            else if (ch == '0') code = 0x27;
            else if (ch == ' ') code = 0x2C; else if (ch == '.') code = 0x37; else if (ch == '-') code = 0x2D; else if (ch == '/') code = 0x38; else if (ch == '@') { code = 0x1F; mod = 0x02; }
            if (code == 0) continue;
            final int c = code, m = mod;
            kb(m, c); try { Thread.sleep(45); } catch (InterruptedException ignored) { }
        }
    }
}
