// false = the sign-in gate is off for everybody. A single device can still try it by adding ?gate=1 to the app link.
// true = every device must sign in with the username and password given by the provider before the app opens.
export const GATE_ENABLED: boolean = false;
