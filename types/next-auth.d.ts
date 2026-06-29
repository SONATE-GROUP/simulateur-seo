import NextAuth from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      isGlobalAdmin: boolean;
      disabled?: boolean;
    };
  }
  interface User {
    isGlobalAdmin: boolean;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    isGlobalAdmin: boolean;
  }
}
