import React, { useState, useEffect } from 'react';
import { Users, Plus, Loader2, MapPin, Phone, Mail, Trash2 } from 'lucide-react';

export default function Clientes({ token }: { token: string }) {
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const initialFormState = {
    cpfCnpj: '',
    inscricaoMunicipal: '',
    inscricaoEstadual: '',
    name: '', // Nome/Razão social
    email: '',
    telefone: '',
    cep: '',
    municipioUf: '',
    logradouro: '',
    bairro: '',
    numero: '',
    complemento: ''
  };

  const [newClient, setNewClient] = useState(initialFormState);

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

  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este cliente?')) return;
    
    setDeletingId(id);
    try {
      const res = await fetch(`/api/clients/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (res.ok) {
        setClients(clients.filter(c => c.id !== id));
      } else {
        const data = await res.json();
        alert(data.error || 'Erro ao excluir cliente');
      }
    } catch (err) {
      console.error('Erro ao excluir cliente', err);
      alert('Erro de conexão ao excluir cliente');
    } finally {
      setDeletingId(null);
    }
  };

  const handleCepChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const cep = e.target.value.replace(/\D/g, '');
    setNewClient({ ...newClient, cep: e.target.value });
    
    if (cep.length === 8) {
      try {
        const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await res.json();
        if (!data.erro) {
          setNewClient(prev => ({
            ...prev,
            logradouro: data.logradouro || '',
            bairro: data.bairro || '',
            municipioUf: `${data.localidade || ''}/${data.uf || ''}`
          }));
        }
      } catch (err) {
        console.error("Erro ao buscar CEP", err);
      }
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
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
        setNewClient(initialFormState);
        setShowForm(false);
        fetchClients();
      }
    } catch (err) {
      console.error('Erro ao adicionar cliente', err);
    } finally {
      setSaving(false);
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
          {showForm ? 'Cancelar' : 'Novo Cliente'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="bg-brand-surface border border-brand-border rounded-xl p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-5">
            <div>
              <label className="block text-xs font-semibold text-brand-muted uppercase tracking-wide mb-2">CPF/CNPJ *</label>
              <input
                type="text"
                value={newClient.cpfCnpj}
                onChange={e => setNewClient({ ...newClient, cpfCnpj: e.target.value })}
                className="w-full bg-brand-surface2 border border-brand-border rounded-lg px-4 py-2.5 text-brand-text outline-none focus:border-brand-green transition-colors"
                placeholder="Número do documento do tomador"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-brand-muted uppercase tracking-wide mb-2">Inscrição Municipal</label>
              <input
                type="text"
                value={newClient.inscricaoMunicipal}
                onChange={e => setNewClient({ ...newClient, inscricaoMunicipal: e.target.value })}
                className="w-full bg-brand-surface2 border border-brand-border rounded-lg px-4 py-2.5 text-brand-text outline-none focus:border-brand-green transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-brand-muted uppercase tracking-wide mb-2">Inscrição Estadual</label>
              <input
                type="text"
                value={newClient.inscricaoEstadual}
                onChange={e => setNewClient({ ...newClient, inscricaoEstadual: e.target.value })}
                className="w-full bg-brand-surface2 border border-brand-border rounded-lg px-4 py-2.5 text-brand-text outline-none focus:border-brand-green transition-colors"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
            <div>
              <label className="block text-xs font-semibold text-brand-muted uppercase tracking-wide mb-2">Nome/Razão Social *</label>
              <input
                type="text"
                value={newClient.name}
                onChange={e => setNewClient({ ...newClient, name: e.target.value })}
                className="w-full bg-brand-surface2 border border-brand-border rounded-lg px-4 py-2.5 text-brand-text outline-none focus:border-brand-green transition-colors"
                placeholder="Razão social do tomador"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-brand-muted uppercase tracking-wide mb-2">Email</label>
              <input
                type="email"
                value={newClient.email}
                onChange={e => setNewClient({ ...newClient, email: e.target.value })}
                className="w-full bg-brand-surface2 border border-brand-border rounded-lg px-4 py-2.5 text-brand-text outline-none focus:border-brand-green transition-colors"
                placeholder="Email principal de contato do tomador"
              />
            </div>
          </div>

          <div className="mb-8 w-full md:w-1/3 pr-2.5">
            <label className="block text-xs font-semibold text-brand-muted uppercase tracking-wide mb-2">Telefone</label>
            <input
              type="text"
              value={newClient.telefone}
              onChange={e => setNewClient({ ...newClient, telefone: e.target.value })}
              className="w-full bg-brand-surface2 border border-brand-border rounded-lg px-4 py-2.5 text-brand-text outline-none focus:border-brand-green transition-colors"
            />
          </div>

          <h3 className="text-sm font-bold text-brand-text border-b border-brand-border pb-2 mb-5">Dados do Endereço</h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-5">
            <div>
              <label className="block text-xs font-semibold text-brand-muted uppercase tracking-wide mb-2">CEP</label>
              <input
                type="text"
                value={newClient.cep}
                onChange={handleCepChange}
                className="w-full bg-brand-surface2 border border-brand-border rounded-lg px-4 py-2.5 text-brand-text outline-none focus:border-brand-green transition-colors"
                maxLength={9}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-brand-muted uppercase tracking-wide mb-2">Município/UF</label>
              <input
                type="text"
                value={newClient.municipioUf}
                readOnly
                className="w-full bg-brand-surface2/50 border border-brand-border rounded-lg px-4 py-2.5 text-brand-muted outline-none cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-brand-muted uppercase tracking-wide mb-2">Logradouro</label>
              <input
                type="text"
                value={newClient.logradouro}
                readOnly
                className="w-full bg-brand-surface2/50 border border-brand-border rounded-lg px-4 py-2.5 text-brand-muted outline-none cursor-not-allowed"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
            <div>
              <label className="block text-xs font-semibold text-brand-muted uppercase tracking-wide mb-2">Bairro</label>
              <input
                type="text"
                value={newClient.bairro}
                readOnly
                className="w-full bg-brand-surface2/50 border border-brand-border rounded-lg px-4 py-2.5 text-brand-muted outline-none cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-brand-muted uppercase tracking-wide mb-2">Número</label>
              <input
                type="text"
                value={newClient.numero}
                onChange={e => setNewClient({ ...newClient, numero: e.target.value })}
                className="w-full bg-brand-surface2 border border-brand-border rounded-lg px-4 py-2.5 text-brand-text outline-none focus:border-brand-green transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-brand-muted uppercase tracking-wide mb-2">Complemento</label>
              <input
                type="text"
                value={newClient.complemento}
                onChange={e => setNewClient({ ...newClient, complemento: e.target.value })}
                className="w-full bg-brand-surface2 border border-brand-border rounded-lg px-4 py-2.5 text-brand-text outline-none focus:border-brand-green transition-colors"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button 
              type="submit" 
              disabled={saving}
              className="bg-brand-green hover:bg-brand-green-dim text-black font-bold py-2.5 px-8 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
              Salvar Cliente
            </button>
          </div>
        </form>
      )}

      <div className="bg-brand-surface border border-brand-border rounded-xl overflow-hidden">
        {clients.length === 0 ? (
          <div className="p-8 text-center text-brand-muted">
            <Users size={48} className="mx-auto mb-4 opacity-20" />
            <p>Nenhum cliente cadastrado ainda.</p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr>
                <th className="px-6 py-3 text-xs font-semibold text-brand-dim uppercase tracking-wide border-b border-brand-border bg-brand-surface2">Cliente</th>
                <th className="px-6 py-3 text-xs font-semibold text-brand-dim uppercase tracking-wide border-b border-brand-border bg-brand-surface2">CPF/CNPJ</th>
                <th className="px-6 py-3 text-xs font-semibold text-brand-dim uppercase tracking-wide border-b border-brand-border bg-brand-surface2">Contato</th>
                <th className="px-6 py-3 text-xs font-semibold text-brand-dim uppercase tracking-wide border-b border-brand-border bg-brand-surface2">Localidade</th>
                <th className="px-6 py-3 text-xs font-semibold text-brand-dim uppercase tracking-wide border-b border-brand-border bg-brand-surface2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client, i) => (
                <tr key={client.id} className={`hover:bg-brand-surface2/50 transition-colors ${i !== clients.length - 1 ? 'border-b border-brand-border/50' : ''}`}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-8 h-8 rounded-full flex items-center justify-center text-black font-bold text-xs"
                        style={{ backgroundColor: client.color || '#10b981' }}
                      >
                        {client.init || client.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium text-brand-text">{client.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-brand-muted font-mono">
                    {client.cpfCnpj || client.cnpj || '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-brand-muted">
                    <div className="flex flex-col gap-1">
                      {client.email && <div className="flex items-center gap-1.5"><Mail size={12} /> {client.email}</div>}
                      {client.telefone && <div className="flex items-center gap-1.5"><Phone size={12} /> {client.telefone}</div>}
                      {!client.email && !client.telefone && '-'}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-brand-muted">
                    {client.municipioUf ? (
                      <div className="flex items-center gap-1.5"><MapPin size={12} /> {client.municipioUf}</div>
                    ) : '-'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleDelete(client.id)}
                      disabled={deletingId === client.id}
                      className="p-2 text-brand-muted hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors disabled:opacity-50"
                      title="Excluir cliente"
                    >
                      {deletingId === client.id ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
