import { AssistantChat } from '../../components/AssistantChat.tsx';

const OWNER_EXAMPLES = ['Что у меня завтра?', 'Сколько машин было на неделе?', 'Сколько денег получено?'];

export default function OwnerAssistantPage() {
  return (
    <main className="page page-narrow stack">
      <p className="muted" style={{ margin: 0 }}>
        Помощник отвечает по записям и оплатам вашего автосервиса.
      </p>
      <div className="card">
        <AssistantChat mode="owner" examples={OWNER_EXAMPLES} intro="Спросите про записи, машины или деньги — отвечу по данным сервиса." />
      </div>
    </main>
  );
}
