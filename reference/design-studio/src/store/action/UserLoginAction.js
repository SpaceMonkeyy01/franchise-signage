import { createAsyncThunk } from "@reduxjs/toolkit";
import API from "../../json/apiConfig.js";
import axios from "axios";
import { toast } from "sonner";
import {
  localStorageIs2faVerified,
  localStorageTokenKey,
} from "../../utils/localStorageTokenKey";
import { UnauthorizedUser } from "../../utils/Unauthorized";
import { is2faCleared, twoFaStorageValue } from "../../utils/twoFactor";
import { clearAppStorage } from "../../utils/clearAppStorage";
import {
  findDevLogin,
  devToken,
  storeDevUser,
  readDevUser,
  clearDevUser,
} from "../../utils/devAuth";
import { fetchDevBackendToken } from "../../utils/devBackendAuth";
import { ROLE_HOME } from "../../config/roles";
import { DEV_ROLE_OVERRIDE_KEY } from "../../hooks/useRole";

// Role/company enrichment from the NestJS data backend's GET /me was removed
// with that backend. `role` now comes from api.signize.ai plus ROLE_BY_EMAIL
// (see useRole.js), which is all the studio gates on.

export const UserLoginAction = createAsyncThunk(
  "user/login",
  async (payload, thunkAPI) => {
    try {
      // Dev-only: let seeded mock users (adminMockUsers.js) log in without the
      // backend so every role is testable directly. Never runs in production.
      if (import.meta.env.DEV) {
        const devUser = findDevLogin(
          payload.form?.email,
          payload.form?.password
        );
        if (devUser) {
          if (devUser.status === "suspended") {
            toast.error("This account is suspended.");
            return thunkAPI.rejectWithValue("suspended");
          }
          // Mock users have no backend account, so borrow a real service-account
          // token for live API calls (studio pricing/mockups). Identity stays the
          // mock user (restored by readDevUser, not by the token). Falls back to
          // the fake token if the service login isn't configured / fails.
          const realToken = await fetchDevBackendToken();
          localStorage.setItem(
            localStorageTokenKey,
            realToken ?? devToken(devUser)
          );
          localStorage.setItem(localStorageIs2faVerified, "true");
          // The mock user carries its real role â€” drop any manual preview
          // override so it doesn't mask the account you just logged in as.
          localStorage.removeItem(DEV_ROLE_OVERRIDE_KEY);
          storeDevUser(devUser);
          toast.success(`Signed in as ${devUser.name} (${devUser.role})`);
          payload.navigate(ROLE_HOME[devUser.role] ?? "/");
          return { user: devUser, token: realToken ?? devToken(devUser) };
        }
      }

      const response = await axios.post(API.BACKEND_API_URL + "/login", {
        ...payload.form,
      });
      const responseData = await response.data;
      if (responseData?.user && responseData?.token) {
        // A real login owns its identity â€” drop any leftover mock-session user.
        clearDevUser();
        localStorage.setItem(localStorageTokenKey, responseData?.token);
        // Only gate on 2FA when the backend says it is enabled for this user;
        // otherwise the login dead-ends on /verification. See utils/twoFactor.js.
        const cleared = is2faCleared(responseData);
        localStorage.setItem(localStorageIs2faVerified, cleared ? "true" : "false");
        payload.navigate(cleared ? "/studio" : "/verification");
      }

      return responseData;
    } catch (error) {
      console.log("errrrrorrrrr", error);
      if (error?.status == 401) {
        UnauthorizedUser(payload.navigate);
      }
      toast.error(error.response?.data?.error || error.message);
      return thunkAPI.rejectWithValue(error.response?.data || error.message);
    }
  }
);

export const GetLoggedInUser = createAsyncThunk(
  "user/getLoggedInUser",
  async (payload, thunkAPI) => {
    try {
      // Dev-only: restore a mock session on refresh/bootstrap by the stored mock
      // user (NOT the token â€” that's now a real service token, so /user would
      // return the service account instead of the mock identity).
      if (import.meta.env.DEV) {
        const devUser = readDevUser();
        if (devUser) {
          localStorage.setItem(localStorageIs2faVerified, "true");
          return devUser;
        }
      }

      const response = await axios.get(API.BACKEND_API_URL + "/user", {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${localStorage.getItem(localStorageTokenKey)}`,
        },
      });
      const responseData = await response.data;
      // Keep the 2FA gate consistent on refresh/bootstrap: without this, a page
      // reload would overwrite the cleared flag with the raw backend value and
      // re-trap the user on /verification. See utils/twoFactor.js.
      localStorage.setItem(
        localStorageIs2faVerified,
        twoFaStorageValue(responseData)
      );
      return responseData;
    } catch (error) {
      console.log("errrrrorrrrr", error);
      if (error?.status == 401) {
        UnauthorizedUser(payload.navigate);
      }
      toast.error(
        error.response?.data?.error ||
          error.response?.data?.message ||
          error.message
      );
      return thunkAPI.rejectWithValue(
        error.response?.data?.error ||
          error.response?.data?.message ||
          error.message
      );
    }
  }
);

export const GetDefaultOptions = createAsyncThunk(
  "get/default/options",
  async (payload, thunkAPI) => {
    try {
      const response = await axios.get(
        API.BACKEND_API_URL + "/get/default/data",
        // { sign_type: payload.name || null }
      );
      const responseData = await response.data;
      console.log("responseData", responseData);

      return responseData;
    } catch (error) {
      console.log("errrrrorrrrr", error);
      if (error?.status == 401) {
        UnauthorizedUser(payload.navigate);
      }
      toast.error(
        error.response?.data?.error ||
          error.response?.data?.message ||
          error.message
      );
      return thunkAPI.rejectWithValue(
        error.response?.data?.error ||
          error.response?.data?.message ||
          error.message
      );
    }
  }
);

export const LogOutUserAction = createAsyncThunk(
  "logout/user",
  async (payload, thunkAPI) => {
    try {
      const authToken = localStorage.getItem(localStorageTokenKey);


      // Wipe all user-scoped app data, not just the token + 2FA flag, so a
      // shared machine retains no PII/stub data after logout.
      clearAppStorage();
      // payload.navigate("/login");
      window.location.reload();
      
      const response = await axios.post(
        API.BACKEND_API_URL + "/logout",
        {},
        {
          headers: {
            Authorization: "Bearer " + authToken,
          },
        }
      );
      const responseData = await response.data;
      return responseData;
    } catch (error) {
      // Wipe all user-scoped app data, not just the token + 2FA flag, so a
      // shared machine retains no PII/stub data after logout.
      clearAppStorage();

      // payload.navigate("/login");
      window.location.reload();

      console.log("errrrrorrrrr", error);
      if (error?.status == 401) {
        UnauthorizedUser(payload.navigate);
      }
      toast.error(
        error.response?.data?.error ||
          error.response?.data?.message ||
          error.message
      );
      return thunkAPI.rejectWithValue(
        error.response?.data?.error ||
          error.response?.data?.message ||
          error.message
      );
    }
  }
);
