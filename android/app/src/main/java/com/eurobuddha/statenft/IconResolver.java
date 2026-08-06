package com.eurobuddha.statenft;

import android.util.Base64;

import java.net.URLDecoder;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class IconResolver {
    private static final Pattern PCT = Pattern.compile("%[0-9A-Fa-f]{2}");
    private static final Pattern ARTIMAGE = Pattern.compile("<artimage[^>]*>([\\s\\S]*?)</artimage>", Pattern.CASE_INSENSITIVE);
    private static final Pattern DATA_IMG = Pattern.compile("^data:image/(png|jpe?g|gif|webp|svg\\+xml|x-icon|bmp);", Pattern.CASE_INSENSITIVE);
    private static final Pattern HTTP = Pattern.compile("^https?://", Pattern.CASE_INSENSITIVE);
    private static final Pattern B64 = Pattern.compile("^[A-Za-z0-9+/]+={0,2}$");

    private IconResolver() {}

    public static String resolve(String raw) {
        if (raw == null) return null;
        String t = raw.trim();
        if (t.isEmpty()) return null;
        if (PCT.matcher(t).find()) {
            try { t = URLDecoder.decode(t, "UTF-8").trim(); } catch (Exception ignored) {}
        }
        if (t.regionMatches(true, 0, "<artimage", 0, 9)) {
            Matcher m = ARTIMAGE.matcher(t);
            if (m.find()) {
                String b64 = m.group(1).replaceAll("\\s+", "");
                if (b64.length() > 16) return ImageTools.dataUri(b64);
            }
        }
        if (DATA_IMG.matcher(t).find()) return t;
        if (HTTP.matcher(t).find()) return t;
        if (t.regionMatches(true, 0, "<svg", 0, 4) && t.toLowerCase().endsWith("</svg>")) {
            try { return "data:image/svg+xml;base64," + Base64.encodeToString(t.getBytes("UTF-8"), Base64.NO_WRAP); }
            catch (Exception e) { return null; }
        }
        if (t.length() >= 100 && B64.matcher(t).matches()) return ImageTools.dataUri(t);
        return null;
    }
}
