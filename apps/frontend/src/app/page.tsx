'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Form, TextField, Input, Label, FieldError } from '@heroui/react';
import { Modal, useOverlayState } from '@heroui/react';

interface Meeting {
  id: string;
  title: string;
  date: string;
  participants: string[];
  createdBy: string;
  createdAt: string;
}

const API_BASE = 'http://localhost:3001';

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('access_token');
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

export default function Home() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [recentMeetings, setRecentMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const modalState = useOverlayState();
  const [createError, setCreateError] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const loadMeetings = async () => {
    const [meetingsRes, recentRes] = await Promise.all([
      fetch(`${API_BASE}/meetings`, { headers: authHeaders() }),
      fetch(`${API_BASE}/meetings/recent?limit=3`, { headers: authHeaders() }),
    ]);
    if (meetingsRes.ok) setMeetings(await meetingsRes.json());
    if (recentRes.ok) setRecentMeetings(await recentRes.json());
  };

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.replace('/login');
      return;
    }

    const fetchData = async () => {
      try {
        const [profileRes] = await Promise.all([
          fetch(`${API_BASE}/auth/profile`, { headers: authHeaders() }),
        ]);

        if (!profileRes.ok) {
          localStorage.removeItem('access_token');
          router.replace('/login');
          return;
        }

        const profile = await profileRes.json();
        setEmail(profile.email);
        await loadMeetings();
      } catch {
        localStorage.removeItem('access_token');
        router.replace('/login');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    router.replace('/login');
  };

  const handleCreateMeeting = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setCreateError('');
    setIsCreating(true);

    const formData = new FormData(e.currentTarget);
    const title = (formData.get('title') as string).trim();
    const date = formData.get('date') as string;
    const participantsRaw = (formData.get('participants') as string).trim();
    const participants = participantsRaw
      ? participantsRaw
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean)
      : [];

    if (!title) {
      setCreateError('Введите название встречи');
      setIsCreating(false);
      return;
    }
    if (!date) {
      setCreateError('Укажите дату встречи');
      setIsCreating(false);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/meetings`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ title, date, participants }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = Array.isArray(data.message)
          ? data.message.join(', ')
          : data.message || 'Ошибка создания встречи';
        throw new Error(msg);
      }

      await loadMeetings();
      modalState.close();
      // reset form fields visually by closing and reopening — the form unmounts with the modal
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Произошла ошибка');
    } finally {
      setIsCreating(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-neutral-50 to-neutral-100 dark:from-neutral-950 dark:to-neutral-900">
        <p className="text-neutral-500 dark:text-neutral-400">Загрузка...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-neutral-50 to-neutral-100 dark:from-neutral-950 dark:to-neutral-900">
      <header className="bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <h1 className="text-lg font-semibold">Video Meetings</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-neutral-600 dark:text-neutral-400">{email}</span>
            <Button variant="tertiary" onPress={handleLogout}>
              Выйти
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
        {recentMeetings.length > 0 && (
          <section>
            <h2 className="text-xl font-semibold mb-4">Последние 3 встречи</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {recentMeetings.map((m) => (
                <MeetingCard key={m.id} meeting={m} />
              ))}
            </div>
          </section>
        )}

        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Все встречи</h2>
            <Button onPress={modalState.open}>Создать встречу</Button>
          </div>

          {meetings.length === 0 ? (
            <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-10 text-center">
              <p className="text-neutral-500 dark:text-neutral-400">У вас пока нет встреч</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {meetings.map((m) => (
                <MeetingCard key={m.id} meeting={m} />
              ))}
            </div>
          )}
        </section>
      </div>

      <Modal.Root state={modalState}>
        <Modal.Backdrop>
          <Modal.Container size="md">
            <Modal.Dialog>
              <Modal.Header>
                <Modal.Heading>Новая встреча</Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                <Form className="flex flex-col gap-5" onSubmit={handleCreateMeeting}>
                  <TextField isRequired name="title">
                    <Label>Название</Label>
                    <Input placeholder="Еженедельный стендап" />
                    <FieldError />
                  </TextField>

                  <TextField isRequired name="date" type="text">
                    <Label>Дата (ISO)</Label>
                    <Input type="date" />
                    <FieldError />
                  </TextField>

                  <TextField name="participants" type="text">
                    <Label>Участники (через запятую)</Label>
                    <Input placeholder="a@example.com, b@example.com" />
                    <FieldError />
                  </TextField>

                  {createError && (
                    <div className="rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 p-3">
                      <p className="text-sm text-red-600 dark:text-red-400">{createError}</p>
                    </div>
                  )}

                  <div className="flex gap-3 justify-end">
                    <Button variant="tertiary" onPress={modalState.close} type="button">
                      Отмена
                    </Button>
                    <Button type="submit" isPending={isCreating}>
                      {isCreating ? 'Создание...' : 'Создать'}
                    </Button>
                  </div>
                </Form>
              </Modal.Body>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal.Root>
    </main>
  );
}

function MeetingCard({ meeting }: { meeting: Meeting }) {
  const dateStr = new Date(meeting.date).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-sm border border-neutral-200 dark:border-neutral-800 p-5 flex flex-col gap-2">
      <h3 className="font-semibold text-base">{meeting.title}</h3>
      <time className="text-sm text-neutral-500 dark:text-neutral-400">{dateStr}</time>
      {meeting.participants.length > 0 && (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Участники: {meeting.participants.join(', ')}
        </p>
      )}
    </div>
  );
}
