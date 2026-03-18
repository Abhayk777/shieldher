import AuthForm from '@/components/AuthForm';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign In — ShieldHer',
  description: 'Sign in or create an account to start analyzing your chat screenshots.',
};

export default function AuthPage() {
  return <AuthForm />;
}
