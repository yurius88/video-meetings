'use client';

import { useState } from 'react';
import { Button, Form, TextField, Input, Label, FieldError } from '@heroui/react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    try {
      const response = await fetch('http://localhost:3001/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Ошибка входа');
      }

      const data = await response.json();
      localStorage.setItem('access_token', data.access_token);
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Произошла ошибка при входе');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-8 bg-gradient-to-br from-neutral-50 to-neutral-100 dark:from-neutral-950 dark:to-neutral-900">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Вход</h1>
          <p className="text-neutral-600 dark:text-neutral-400">
            Войдите в свой аккаунт для доступа к платформе
          </p>
        </div>

        <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-xl p-8 border border-neutral-200 dark:border-neutral-800">
          <Form className="flex flex-col gap-6" onSubmit={handleSubmit}>
            <TextField
              isRequired
              name="email"
              type="email"
              validate={(value) => {
                if (!/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(value)) {
                  return 'Введите корректный email адрес';
                }
                return null;
              }}
            >
              <Label>Email</Label>
              <Input placeholder="user@example.com" />
              <FieldError />
            </TextField>

            <TextField isRequired name="password" type="password">
              <Label>Пароль</Label>
              <Input placeholder="Введите пароль" />
              <FieldError />
            </TextField>

            {error && (
              <div className="rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 p-4">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            <Button type="submit" isPending={isLoading} fullWidth>
              {isLoading ? 'Вход...' : 'Войти'}
            </Button>
          </Form>

          <div className="mt-6 text-center">
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Нет аккаунта?{' '}
              <a href="/register" className="font-medium text-accent hover:underline">
                Зарегистрироваться
              </a>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
