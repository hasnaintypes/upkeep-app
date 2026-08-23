export const AUTH_ROUTES = {
  login: "/auth/login",
  signUp: "/auth/sign-up",
  signUpSuccess: "/auth/sign-up-success",
  forgotPassword: "/auth/forgot-password",
  updatePassword: "/auth/update-password",
  error: "/auth/error",
  confirm: "/auth/confirm",
} as const;

/** Where an authenticated user should land after login / signup / password update. */
export const DEFAULT_AUTHENTICATED_REDIRECT = "/dashboard";
