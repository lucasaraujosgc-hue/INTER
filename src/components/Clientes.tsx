import React, { useState, useEffect } from 'react';
import { Users, Plus, Loader2 } from 'lucide-react';

export default function Clientes({ token }: { token: string }) {
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newClient, setNewClient] = useState({ name: '', cnpj: '' });

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    try {
      const res = await fetch('/api/clients', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setClients(data);
    } catch (err) {
      console.error('Erro ao buscar clientes', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newClient)
      });
      if (res.ok) {
        setNewClient({ name: '', cnpj: '' });
        setShowForm(false);
        fetchClients();
      }
    } catch (err) {
      console.error('Erro ao adicionar cliente', err);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="animate-spin text-brand-green" /></div>;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-lg font-bold text-brand-text">Gerenciamento de Clientes</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-brand-green hover:bg-brand-green-dim text-black font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition-colors"
        >
          <Plus size={16} />
          Novo Cliente
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="bg-brand-surface border border-brand-border rounded-xl p-6 mb-6 flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-brand-muted uppercase tracking-wide mb-2">Razão Social</label>
            <input
              type="text"
              value={newClient.name}
              onChange={e => setNewClient({ ...newClient, name: e.target.value })}
              className="w-full bg-brand-surface2 border border-brand-border rounded-lg px-4 py-2.5 text-brand-text outline-none focus:border-brand-green transition-colors"
              required
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-semibold text-brand-muted uppercase tracking-wide mb-2">CNPJ</label>
            <input
              type="text"
              value={newClient.cnpj}
              onChange={e => setNewClient({ ...newClient, cnpj: e.target.value })}
              className="w-full bg-brand-surface2 border border-brand-border rounded-lg px-4 py-2.5 text-brand-text outline-none focus:border-brand-green transition-colors"
              required
            />
          </div>
          <button type="submit" className="bg-brand-green hover:bg-brand-green-dim text-black font-bold py-2.5 px-6 rounded-lg transition-colors">
            Salvar
          </button>
        </form>
      )}

      <div className="bg-brand-surface border border-brand-border rounded-xl overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr>
              <th className="px-6 py-3 text-xs font-semibold text-brand-dim uppercase tracking-wide border-b border-brand-border bg-brand-surface2">Cliente</th>
              <th className="px-6 py-3 text-xs font-semibold text-brand-dim uppercase tracking-wide border-b border-brand-border bg-brand-surface2">CNPJ</th>
            </tr>
          </thead>
          <tbody>
            {clients.map(client => (
              <tr key={client.id} className="border-b border-white/5 last:border-0 hover:bg-brand-surface2 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-black" style={{ backgroundColor: client.color }}>
                      {client.init}
                    </div>
                    <span className="font-medium text-brand-text">{client.name}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-brand-muted font-mono text-sm">{client.cnpj}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
