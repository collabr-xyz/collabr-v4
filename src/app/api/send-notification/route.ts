import { Resend } from 'resend';
import { NextRequest, NextResponse } from 'next/server';

const resend = new Resend(process.env.NEXT_PUBLIC_RESEND_API_KEY);

export async function POST(req: NextRequest) {
  try {
    const { email, platform, socialHandle } = await req.json();

    // Simple validation
    if (!email || !platform || !socialHandle) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const data = await resend.emails.send({
      from: 'Collabr <onboarding@resend.dev>',
      to: process.env.NEXT_PUBLIC_NOTIFICATION_EMAIL || 'henry@collabr.xyz',
      subject: 'New Community Host Application',
      html: `
        <h2>New Community Host Application</h2>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Platform:</strong> ${platform}</p>
        <p><strong>Social Handle:</strong> @${socialHandle}</p>
        <p>Time: ${new Date().toLocaleString()}</p>
      `,
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Email sending failed:', error);
    return NextResponse.json(
      { error: 'Failed to send notification email' },
      { status: 500 }
    );
  }
} 