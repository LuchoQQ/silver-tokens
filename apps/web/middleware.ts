import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export default auth(async (req) => {
  const pathname = req.nextUrl.pathname;

  if (pathname.startsWith('/admin')) {
    const session = await auth();
    if (!session || (session.user.role !== 'staff' && session.user.role !== 'admin')) {
      return NextResponse.redirect(new URL('/me', req.url));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/admin/:path*'],
};
