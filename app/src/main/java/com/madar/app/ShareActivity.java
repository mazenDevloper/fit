package com.madar.app;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.ArrayList;

/**
 * «زر المشاركة»: this app in Android's share sheet. Links and text open the «أرسل إلى» page at once; a shared file
 * (PDF, photo, video) is uploaded to the server first, then the page offers what to do with it and where
 * (Madar, the car, the TV, this phone, later).
 */
public class ShareActivity extends Activity {
    static final String PAGE = "https://mazendevloper.github.io/fit/share.html";
    static final String UPLOAD = "https://studio.c-p.workers.dev/upload";

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        Intent in = getIntent();
        String type = in.getType() == null ? "" : in.getType();
        ArrayList<Uri> files = new ArrayList<>();
        if (Intent.ACTION_SEND_MULTIPLE.equals(in.getAction())) {
            ArrayList<Uri> l = in.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (l != null) files.addAll(l);
        } else {
            Uri u = in.getParcelableExtra(Intent.EXTRA_STREAM);
            if (u != null) files.add(u);
        }
        String text = in.getStringExtra(Intent.EXTRA_TEXT), title = in.getStringExtra(Intent.EXTRA_SUBJECT);
        if (files.isEmpty()) {
            if (in.getData() != null && text == null) text = in.getData().toString();   // geo: / https: links opened with the app
            open("text=" + enc(text) + "&title=" + enc(title));
            return;
        }
        Toast.makeText(this, "⬆️ رفع الملف…", Toast.LENGTH_SHORT).show();
        final Uri f = files.get(0);
        new Thread(() -> {
            try {
                String t = getContentResolver().getType(f);
                if (t == null) t = type;
                String name = nameOf(f);
                ByteArrayOutputStream buf = new ByteArrayOutputStream();
                try (InputStream is = getContentResolver().openInputStream(f)) {
                    byte[] chunk = new byte[65536]; int n;
                    while ((n = is.read(chunk)) > 0) { buf.write(chunk, 0, n); if (buf.size() > 60_000_000) throw new Exception("الملف أكبر من 60 ميغابايت"); }
                }
                HttpURLConnection c = (HttpURLConnection) new URL(UPLOAD + "?name=" + enc(name)).openConnection();
                c.setDoOutput(true); c.setRequestMethod("POST"); c.setRequestProperty("Content-Type", t);
                c.setFixedLengthStreamingMode(buf.size()); c.setConnectTimeout(15000); c.setReadTimeout(120000);
                try (OutputStream os = c.getOutputStream()) { buf.writeTo(os); }
                InputStream rs = c.getResponseCode() < 400 ? c.getInputStream() : c.getErrorStream();
                ByteArrayOutputStream rb = new ByteArrayOutputStream(); byte[] x = new byte[4096]; int k;
                while ((k = rs.read(x)) > 0) rb.write(x, 0, k);
                JSONObject r = new JSONObject(rb.toString("UTF-8"));
                if (!r.has("url")) throw new Exception(r.optString("error", "upload"));
                final String q = "file=" + enc(r.getString("url")) + "&name=" + enc(name) + "&type=" + enc(t) + (text != null ? "&text=" + enc(text) : "");
                runOnUiThread(() -> open(q));
            } catch (Exception e) {
                final String m = e.getMessage();
                runOnUiThread(() -> { Toast.makeText(this, "تعذّر الرفع: " + m, Toast.LENGTH_LONG).show(); finish(); });
            }
        }).start();
    }

    private void open(String query) {
        try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(PAGE + "?" + query)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); } catch (Exception ignored) { }
        finish();
    }

    private String nameOf(Uri u) {
        try (Cursor c = getContentResolver().query(u, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst()) return c.getString(0);
        } catch (Exception ignored) { }
        String p = u.getLastPathSegment();
        return p == null ? "file" : p;
    }

    private static String enc(String s) {
        try { return s == null ? "" : URLEncoder.encode(s, "UTF-8"); } catch (Exception e) { return ""; }
    }
}
