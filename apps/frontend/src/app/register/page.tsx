'use client';

import { useState } from 'react';
import { Button, Form, TextField, Input, Label, FieldError, Description } from '@heroui/react';
import { useRouter } from 'next/navigation';

export default function RegisterPage() {
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
      const response = await fetch('http://localhost:3001/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Ошибка регистрации');
      }

      const data = await response.json();
      localStorage.setItem('access_token', data.access_token);
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Произошла ошибка при регистрации');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-8 bg-gradient-to-br from-neutral-50 to-neutral-100 dark:from-neutral-950 dark:to-neutral-900">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Регистрация</h1>
          <p className="text-neutral-600 dark:text-neutral-400">
            Создайте аккаунт для доступа к платформе
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

            <TextField
              isRequired
              minLength={8}
              name="password"
              type="password"
              validate={(value) => {
                if (value.length < 8) {
                  return 'Пароль должен содержать минимум 8 символов';
                }
                if (!/[A-Z]/.test(value)) {
                  return 'Пароль должен содержать хотя бы одну заглавную букву';
                }
                if (!/[0-9]/.test(value)) {
                  return 'Пароль должен содержать хотя бы одну цифру';
                }
                return null;
              }}
            >
              <Label>Пароль</Label>
              <Input placeholder="Введите пароль" />
              <Description>Минимум 8 символов, 1 заглавная буква и 1 цифра</Description>
              <FieldError />
            </TextField>

            {error && (
              <div className="rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 p-4">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            <Button type="submit" isPending={isLoading} fullWidth>
              {isLoading ? 'Регистрация...' : 'Зарегистрироваться'}
            </Button>
          </Form>

          <div className="mt-6 text-center">
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Уже есть аккаунт?{' '}
              <a href="/login" className="font-medium text-accent hover:underline">
                Войти
              </a>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
