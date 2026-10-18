package app.stanton.notes;

import android.app.Activity;
import android.content.Intent;
import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.GoogleAuthUtil;
import com.google.android.gms.auth.api.identity.AuthorizationClient;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.common.api.Scope;
import java.util.Collections;

/**
 * Google sign-in for Drive access, using the account already on the phone.
 *
 * Uses Google Play services' Authorization API: the first time, Android shows its own
 * "Choose an account / Allow Stanton to see and edit your Google Drive files" sheet; after
 * that tokens are handed out silently. No client ID is compiled in – Google matches the
 * app's package name and signing certificate (SHA-1) to the Android OAuth client in your
 * Google Cloud project.
 */
@CapacitorPlugin(name = "GoogleDrive")
public class GoogleDrivePlugin extends Plugin {

    private static final String DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";

    private ActivityResultLauncher<IntentSenderRequest> launcher;
    private PluginCall pendingCall;

    @Override
    public void load() {
        launcher = getActivity().registerForActivityResult(new ActivityResultContracts.StartIntentSenderForResult(), this::onConsentResult);
    }

    private AuthorizationClient client() {
        return Identity.getAuthorizationClient(getActivity());
    }

    private AuthorizationRequest request() {
        return AuthorizationRequest.builder().setRequestedScopes(Collections.singletonList(new Scope(DRIVE_SCOPE))).build();
    }

    /** Get a Drive access token. With interactive=false, fails with NEEDS_SIGN_IN instead of showing UI. */
    @PluginMethod
    public void authorize(PluginCall call) {
        final boolean interactive = Boolean.TRUE.equals(call.getBoolean("interactive", true));
        client()
            .authorize(request())
            .addOnSuccessListener(result -> {
                if (result.hasResolution()) {
                    if (!interactive || result.getPendingIntent() == null) {
                        call.reject("Sign-in needed", "NEEDS_SIGN_IN");
                        return;
                    }
                    if (pendingCall != null) {
                        call.reject("A sign-in is already in progress", "BUSY");
                        return;
                    }
                    pendingCall = call;
                    launcher.launch(new IntentSenderRequest.Builder(result.getPendingIntent().getIntentSender()).build());
                } else {
                    resolveWith(call, result);
                }
            })
            .addOnFailureListener(e -> call.reject(describe(e), "AUTH_FAILED", e));
    }

    private void onConsentResult(ActivityResult res) {
        PluginCall call = pendingCall;
        pendingCall = null;
        if (call == null) return;
        if (res.getResultCode() != Activity.RESULT_OK) {
            call.reject("Sign-in was cancelled", "CANCELLED");
            return;
        }
        try {
            Intent data = res.getData();
            AuthorizationResult result = client().getAuthorizationResultFromIntent(data);
            resolveWith(call, result);
        } catch (ApiException e) {
            call.reject(describe(e), "AUTH_FAILED", e);
        }
    }

    private void resolveWith(PluginCall call, AuthorizationResult result) {
        if (result.getAccessToken() == null) {
            call.reject("Google didn't return an access token", "AUTH_FAILED");
            return;
        }
        JSObject ret = new JSObject();
        ret.put("accessToken", result.getAccessToken());
        call.resolve(ret);
    }

    /** Forget a cached token (e.g. after the API said it expired), so the next authorize() fetches a fresh one. */
    @PluginMethod
    public void clearToken(PluginCall call) {
        final String token = call.getString("accessToken");
        if (token == null) {
            call.resolve();
            return;
        }
        new Thread(() -> {
            try {
                GoogleAuthUtil.clearToken(getContext(), token);
            } catch (Exception ignored) {
                // Nothing to clear.
            }
            call.resolve();
        }).start();
    }

    private static String describe(Exception e) {
        if (e instanceof ApiException) {
            int code = ((ApiException) e).getStatusCode();
            // 10 = DEVELOPER_ERROR: the package name / SHA-1 isn't registered as an Android OAuth client.
            if (code == 10) {
                return "Google doesn't recognise this copy of Stanton (error 10). Check the Android OAuth client in Google Cloud has package app.stanton.notes and this app's SHA-1.";
            }
            if (code == 7) return "No internet connection.";
            return "Google sign-in failed (code " + code + ").";
        }
        return e.getMessage() != null ? e.getMessage() : "Google sign-in failed.";
    }
}
