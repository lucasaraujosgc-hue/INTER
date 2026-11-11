import React, { useEffect, useState } from 'react';
import { Save, Upload, PlugZap, ShieldAlert } from 'lucide-react';
import { apiFetch, brl } from '../../lib/api';
import { Card, Field, Input, Select, Btn, Alert, Badge } from '../ui';

export default function InterConfig({ token, onSaved }: { token: string; onSaved: () => void }) {
  const [status, setStatus] = useState<any>(null);
  const [form, setForm] = useState({ clientId: '', clientSecret: '', contaCorrente: '', ambiente: 'producao', chavePix: '', publicUrl: '', permitirSaidas: false, scopes: [] as string[] });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [test, setTest] = useState<any>(null);
  const [crt, setCrt] = useState<File | null>(null);
  const [key, setKey] = useState<File | null>(null);

  const load = async () => {
    const s = await apiFetch<any>(token, '/api/inter/status');
    const settings = await apiFetch<any>(token, '/api/settings');
    setStatus(s);
    setForm(f => ({
      ...f,
      clientId: settings.interClientId || '',
      clientSecret: '',
      contaCorrente: s.contaCorrente || '',
      ambiente: s.ambiente,
      chavePix: s.chavePix || '',
      publicUrl: s.publicUrl || '',
      permitirSaidas: !!s.permitirSaidas,
      scopes: s.scopes || [],
    }));
  };
  useEffect(() => { load().catch(e => setMsg({ type: 'error', text: e.message })); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      await apiFetch(token, '/api/inter/config', { method: 'POST', body: form });
      setMsg({ type: 'success', text: 'Configuração salva.' });
      await load();
      onSaved();
    } catch (e: any) { setMsg({ type: 'error', text: e.message }); } finally { setSaving(false); }
  };

  const uploadCert = async () => {
    if (!crt || !key) { setMsg({ type: 'error', text: 'Selecione o certificado (.crt) e a chave (.key).' }); return; }
    setUploading(true); setMsg(null);
    try {
      const fd = new FormData();
      fd.append('crt', crt);
      fd.append('key', key);
      const r = await apiFetch<any>(token, '/api/inter/certificado', { method: 'POST', body: fd });
      setMsg({ type: 'success', text: `Certificado instalado: ${r.cert?.subject || ''}` });
      setCrt(null); setKey(null);
      await load();
      onSaved();
    } catch (e: any) { setMsg({ type: 'error', text: e.message }); } finally { setUploading(false); }
  };

  const testar = async () => {
    setTesting(true); setTest(null); setMsg(null);
    try { setTest(await apiFetch(token, '/api/inter/testar', { method: 'POST' })); }
    catch (e: any) { setMsg({ type: 'error', text: e.message }); } finally { setTesting(false); }
  };

  const toggleScope = (s: string) => setForm(f => ({ ...f, scopes: f.scopes.includes(s) ? f.scopes.filter(x => x !== s) : [...f.scopes, s] }));

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
      <div className="flex flex-col gap-5">
        {msg && <Alert type={msg.type} onClose={() => setMsg(null)}>{msg.text}</Alert>}
        <Card title="Credenciais da aplicação" subtitle="Internet Banking PJ › Soluções para sua empresa › Nova integração">
          <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Client ID" className="md:col-span-2"><Input value={form.clientId} onChange={e => setForm({ ...form, clientId: e.target.value })} className="font-mono" /></Field>
            <Field label="Client Secret" className="md:col-span-2" hint={status?.hasCredentials ? 'Já configurado. Preencha só para trocar.' : undefined}>
              <Input type="password" value={form.clientSecret} placeholder={status?.hasCredentials ? '••••••••••••' : ''} onChange={e => setForm({ ...form, clientSecret: e.target.value })} className="font-mono" />
            </Field>
            <Field label="Ambiente">
              <Select value={form.ambiente} onChange={e => setForm({ ...form, ambiente: e.target.value })} options={[{ value: 'producao', label: 'Produção' }, { value: 'sandbox', label: 'Sandbox (testes)' }]} />
            </Field>
            <Field label="Conta corrente (opcional)" hint="Só necessário se a aplicação estiver vinculada a mais de uma conta.">
              <Input value={form.contaCorrente} onChange={e => setForm({ ...form, contaCorrente: e.target.value })} />
            </Field>
            <Field label="Chave Pix da conta" hint="Usada nas cobranças Pix e no webhook de Pix recebidos.">
              <Input value={form.chavePix} onChange={e => setForm({ ...form, chavePix: e.target.value })} />
            </Field>
            <Field label="URL pública do sistema" hint="Ex.: https://cobranca.seudominio.com.br — usada para receber os webhooks.">
              <Input value={form.publicUrl} onChange={e => setForm({ ...form, publicUrl: e.target.value })} placeholder="https://" />
            </Field>
            <label className="md:col-span-2 flex items-start gap-3 p-3 rounded-lg border border-amber-500/30 bg-amber-50 cursor-pointer">
              <input type="checkbox" className="accent-amber-500 w-4 h-4 mt-0.5" checked={form.permitirSaidas} onChange={e => setForm({ ...form, permitirSaidas: e.target.checked })} />
              <span className="text-[12.5px]">
                <b className="text-amber-700 flex items-center gap-1"><ShieldAlert size={14} /> Permitir operações de saída</b>
                <span className="text-brand-muted">Libera pagamentos de boletos/DARF, envio de Pix, lotes e devoluções a partir do sistema. Mantenha desligado se não for usar.</span>
              </span>
            </label>
          </div>
          <div className="px-5 pb-5 flex gap-2">
            <Btn variant="orange" icon={<Save size={15} />} loading={saving} onClick={save}>Salvar</Btn>
            <Btn icon={<PlugZap size={15} />} loading={testing} onClick={testar} disabled={!status?.configured}>Testar conexão</Btn>
          </div>
        </Card>

        {test && (
          <Card title="Resultado do teste">
            <div className="p-5 flex flex-col gap-3 text-[13px]">
              <Alert type="success">Token OAuth obtido com {test.scopesConcedidos.length} escopos.</Alert>
              {test.scopesAusentes?.length > 0 && <Alert type="warn">Escopos não concedidos à aplicação: {test.scopesAusentes.join(', ')}. Habilite-os no Internet Banking ou desmarque abaixo.</Alert>}
              {test.saldo && <div>Saldo disponível: <b className="font-mono">{brl(test.saldo.disponivel)}</b></div>}
            </div>
          </Card>
        )}
      </div>

      <div className="flex flex-col gap-5">
        <Card title="Certificado da aplicação (mTLS)" subtitle="Arquivos baixados ao criar a integração: Inter API_Certificado.crt e Inter API_Chave.key">
          <div className="p-5 flex flex-col gap-4">
            {status?.cert ? (
              <div className="text-[12.5px] flex flex-col gap-1">
                <div className="flex items-center gap-2">{status.cert.expired ? <Badge color="red">Expirado</Badge> : status.certMatchesKey ? <Badge color="green">Instalado</Badge> : <Badge color="red">Chave não confere</Badge>}</div>
                <div className="text-brand-muted break-all">{status.cert.subject}</div>
                <div className="text-brand-muted">Validade: {new Date(status.cert.validFrom).toLocaleDateString('pt-BR')} a {new Date(status.cert.validTo).toLocaleDateString('pt-BR')}</div>
              </div>
            ) : <Alert type="info">Nenhum certificado instalado.</Alert>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Certificado (.crt)"><Input type="file" accept=".crt,.pem,.cer" onChange={e => setCrt(e.target.files?.[0] || null)} /></Field>
              <Field label="Chave privada (.key)"><Input type="file" accept=".key,.pem" onChange={e => setKey(e.target.files?.[0] || null)} /></Field>
            </div>
            <div><Btn icon={<Upload size={15} />} loading={uploading} onClick={uploadCert} disabled={!crt || !key}>Instalar certificado</Btn></div>
          </div>
        </Card>

        <Card title="Escopos habilitados" subtitle="Marque os mesmos escopos liberados na aplicação do Internet Banking">
          <div className="p-5 flex flex-col gap-4">
            {status && Object.entries(status.scopeGroups as Record<string, { label: string; scopes: string[] }>).map(([gid, g]) => (
              <div key={gid}>
                <div className="text-[12px] font-semibold text-brand-text mb-2">{g.label}</div>
                <div className="flex flex-wrap gap-2">
                  {g.scopes.map(s => (
                    <label key={s} className={`text-[11px] font-mono px-2 py-1 rounded border cursor-pointer ${form.scopes.includes(s) ? 'border-brand-border-green text-brand-green bg-brand-green/5' : 'border-brand-border text-brand-dim'}`}>
                      <input type="checkbox" className="hidden" checked={form.scopes.includes(s)} onChange={() => toggleScope(s)} />{s}
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <div><Btn icon={<Save size={15} />} loading={saving} onClick={save}>Salvar escopos</Btn></div>
          </div>
        </Card>
      </div>
    </div>
  );
}
