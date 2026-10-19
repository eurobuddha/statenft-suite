package com.eurobuddha.statenft;

import org.json.JSONObject;

import java.net.URLEncoder;

public final class Util {
    public static final String MINIMA_TOKENID = "0x00";

    private Util() {}

    public static boolean isValidAddress(String a) {
        return a != null && a.matches("^(0x[0-9a-fA-F]{64}|Mx[A-Za-z0-9]{40,118})$");
    }

    public static String shorten(String s) {
        if (s == null) return "";
        if (s.length() <= 18) return s;
        return s.substring(0, 8) + ".." + s.substring(s.length() - 6);
    }

    public static String tokenName(Object token) {
        JSONObject object = tokenObject(token);
        if (object != null) token = object;
        if (token instanceof String) return (String) token;
        if (token instanceof JSONObject) {
            Object name = ((JSONObject) token).opt("name");
            JSONObject nameObject = asObject(name);
            if (nameObject != null) name = nameObject;
            if (name instanceof JSONObject) return ((JSONObject) name).optString("name", "Token");
            if (name instanceof String && !((String) name).isEmpty()) return (String) name;
        }
        return "Token";
    }

    /** Core balance TokenMeta.asObject, adapted from Minima JSON to org.json. */
    static JSONObject asObject(Object value) {
        if (value == null || value == JSONObject.NULL) return null;
        if (value instanceof JSONObject) return (JSONObject) value;
        String text = value.toString().trim();
        if (text.startsWith("{")) {
            try { return new JSONObject(text); }
            catch (org.json.JSONException ignored) { }
        }
        return null;
    }

    /** Balance metadata or the existing tokens-command envelope used by StateNft. */
    static JSONObject tokenObject(Object value) {
        JSONObject root = asObject(value);
        JSONObject nested = root == null ? null : asObject(root.opt("token"));
        return nested == null ? root : nested;
    }

    /** URLs ride the tokencreate command line outside JSON — no spaces, quotes or semicolons. */
    public static boolean validCmdUrl(String u) {
        if (u == null || u.isEmpty()) return true;
        return !u.contains(" ") && !u.contains("\"") && !u.contains("'") && !u.contains(";");
    }

    public static String enc(String s) {
        try { return URLEncoder.encode(s, "UTF-8"); } catch (Exception e) { return s; }
    }
}
