import React, { useEffect, useState } from 'react';
import { Shield, Upload, Save, Receipt, Building2 } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { Card, Field, Input, Select, Textarea, Btn, Alert, Badge } from './ui';

const DEFAULTS = {
  nfseProvedor: 'nacional',
  nfseAmbiente: '1',
  prestadorCnpj: '',
  codigoMunicipio: '2929305',
  nfsePrestadorIm: '',
  nfsePrestadorFone: '',
  nfsePrestadorEmail: '',
  nfseOpSimpNac: '3',
  nfseRegApTribSN: '1',
  nfseRegEspTrib: '0',
  nfseCTribNac: '17.19',
  nfseCTribMun: '',
  nfseCNBS: '',
  nfseDescricaoPadrao: '',
  nfseTpRetISSQN: '1',
  nfseInformarAliquota: false,
  aliquota: 2.01,
  nfsePTotTribSN: '',
  nfseSerie: '1',
  nfseProximoNumero: 1,
  nfseLeiaute: 'atual',
  nfseAssinatura: 'sha1',
  nfseIbsCbsAtivo: false,
  nfseCIndOp: '',
  nfseCClassTrib: '',
  entradasCorteNfse: '2026-10-31',
  // legado WebISS
  prestadorIm: '',
  itemLc116: '1719',
  codigoTributacaoMunicipio: '1719',
  cnae: '6920601',
  regimeEspecialTributacao: 6,
  optanteSimplesNacional: 1,
  incentivoFiscal: 2,
};

export default function Configuracoes({ token }: { token: string }) {
  const [form, setForm] = useState<any>(DEFAULTS);
  const [certInfo, setCertInfo] = useState<any>(null);
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [testing, setTesting] = useState(false);

  const load = async () => {
    const s = await apiFetch<any>(token, '/api/settings');
    const eff = s.nfse || {};
    setCertInfo(s.hasCertificate ? s.certInfo : null);
    setForm((prev: any) => {
      const next: any = { ...prev };
      for (const k of Object.keys(DEFAULTS)) if (s[k] !== undefined && s[k] !== null) next[k] = s[k];
      next.nfseProvedor = eff.provedor || next.nfseProvedor;
      next.nfseAmbiente = eff.ambiente || next.nfseAmbiente;
      next.prestadorCnpj = s.prestadorCnpj || eff.cnpj || '';
      next.nfseOpSimpNac = eff.opSimpNac || next.nfseOpSimpNac;
      next.nfseCTribNac = s.nfseCTribNac || eff.cTribNac || next.nfseCTribNac;
      next.nfseDescricaoPadrao = s.nfseDescricaoPadrao || eff.descricaoPadrao || '';
      next.nfseProximoNumero = eff.proximoNumero || next.nfseProximoNumero;
      return next;
    });
  };
  useEffect(() => { load().catch(e => setMsg({ type: 'error', text: e.message })); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const salvar = async () => {
    setSaving(true); setMsg(null);
    try {
      await apiFetch(token, '/api/settings', { method: 'POST', body: { ...form, nfseProximoNumero: Number(form.nfseProximoNumero) || 1 } });
      setMsg({ type: 'success', text: 'Configurações fiscais salvas.' });
      await load();
    } catch (e: any) { setMsg({ type: 'error', text: e.message }); } finally { setSaving(false); }
  };

  const upload = async () => {
    if (!file || !password) { setMsg({ type: 'error', text: 'Selecione o arquivo .pfx e informe a senha.' }); return; }
    setUploading(true); setMsg(null);
    const fd = new FormData();
    fd.append('pfxFile', file);
    fd.append('password', password);
    try {
      const r = await apiFetch<any>(token, '/api/cert/upload', { method: 'POST', body: fd });
      setMsg({ type: 'success', text: r.message });
      setFile(null); setPassword('');
      await load();
    } catch (e: any) { setMsg({ type: 'error', text: e.message }); } finally { setUploading(false); }
  };

  const testar = async () => {
    setTesting(true); setMsg(null);
    try {
      const r = await apiFetch<any>(token, '/api/nfse/test-connection', { method: 'POST' });
      setMsg({ type: 'success', text: r.message + (r.convenio ? `\n${JSON.stringify(r.convenio).slice(0, 400)}` : '') });
    } catch (e: any) { setMsg({ type: 'error', text: e.message }); } finally { setTesting(false); }
  };

  const nacional = form.nfseProvedor !== 'webiss';

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
      <div className="flex flex-col gap-6">
        {msg && <Alert type={msg.type} onClose={() => setMsg(null)}>{msg.text}</Alert>}
        <Card title={<span className="flex items-center gap-2"><Receipt size={16} className="text-brand-green" /> NFS-e — emissão</span>} subtitle="Padrão nacional (Sefin Nacional / Emissor Nacional)">
          <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Provedor de emissão">
              <Select value={form.nfseProvedor} onChange={e => set('nfseProvedor', e.target.value)} options={[{ value: 'nacional', label: 'NFS-e Nacional (Sefin Nacional)' }, { value: 'webiss', label: 'WebISS da prefeitura (legado)' }]} />
            </Field>
            {nacional && (
              <Field label="Ambiente" hint="Use produção restrita para testar sem valor fiscal.">
                <Select value={form.nfseAmbiente} onChange={e => set('nfseAmbiente', e.target.value)} options={[{ value: '1', label: 'Produção' }, { value: '2', label: 'Produção restrita (homologação)' }]} />
              </Field>
            )}
            <Field label="CNPJ do prestador"><Input value={form.prestadorCnpj} onChange={e => set('prestadorCnpj', e.target.value)} /></Field>
            <Field label="Município emissor (código IBGE)" hint="São Gonçalo dos Campos/BA = 2929305"><Input value={form.codigoMunicipio} onChange={e => set('codigoMunicipio', e.target.value)} /></Field>
            {nacional && <>
              <Field label="Inscrição municipal (opcional)" hint="Informe só se o município exigir na DPS."><Input value={form.nfsePrestadorIm} onChange={e => set('nfsePrestadorIm', e.target.value)} /></Field>
              <Field label="E-mail do prestador (opcional)"><Input value={form.nfsePrestadorEmail} onChange={e => set('nfsePrestadorEmail', e.target.value)} /></Field>
            </>}
          </div>
        </Card>

        {nacional ? (
          <Card title="Regime e tributação (DPS)">
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Simples Nacional">
                <Select value={form.nfseOpSimpNac} onChange={e => set('nfseOpSimpNac', e.target.value)} options={[{ value: '1', label: 'Não optante' }, { value: '2', label: 'Optante — MEI' }, { value: '3', label: 'Optante — ME/EPP' }]} />
              </Field>
              {form.nfseOpSimpNac === '3' && (
                <Field label="Regime de apuração (SN)">
                  <Select value={form.nfseRegApTribSN} onChange={e => set('nfseRegApTribSN', e.target.value)} options={[
                    { value: '1', label: '1 - Tributos federais e ISSQN pelo SN' },
                    { value: '2', label: '2 - Federais pelo SN, ISSQN fora do SN' },
                    { value: '3', label: '3 - Federais e ISSQN fora do SN' },
                  ]} />
                </Field>
              )}
              <Field label="Regime especial de tributação">
                <Select value={form.nfseRegEspTrib} onChange={e => set('nfseRegEspTrib', e.target.value)} options={[
                  { value: '0', label: '0 - Nenhum' }, { value: '1', label: '1 - Ato cooperado' }, { value: '2', label: '2 - Estimativa' }, { value: '3', label: '3 - Microempresa municipal' },
                  { value: '4', label: '4 - Notário ou registrador' }, { value: '5', label: '5 - Profissional autônomo' }, { value: '6', label: '6 - Sociedade de profissionais' }, { value: '9', label: '9 - Outros' },
                ]} />
              </Field>
              <Field label="Retenção do ISSQN (padrão)">
                <Select value={form.nfseTpRetISSQN} onChange={e => set('nfseTpRetISSQN', e.target.value)} options={[{ value: '1', label: 'Não retido' }, { value: '2', label: 'Retido pelo tomador' }, { value: '3', label: 'Retido pelo intermediário' }]} />
              </Field>
              <Field label="Código de tributação nacional" hint="Item LC 116 (17.19) ou 6 dígitos (171901)"><Input value={form.nfseCTribNac} onChange={e => set('nfseCTribNac', e.target.value)} /></Field>
              <Field label="Código de tributação municipal (opcional)" hint="3 dígitos, se o município usar"><Input value={form.nfseCTribMun} onChange={e => set('nfseCTribMun', e.target.value)} /></Field>
              <Field label="Código NBS (opcional)" hint="9 dígitos"><Input value={form.nfseCNBS} onChange={e => set('nfseCNBS', e.target.value)} /></Field>
              <Field label="% aproximado de tributos (Simples)" hint="Lei da transparência; vazio = não informar"><Input type="number" step="0.01" value={form.nfsePTotTribSN} onChange={e => set('nfsePTotTribSN', e.target.value)} /></Field>
              <label className="md:col-span-2 flex items-center gap-2 text-[13px] cursor-pointer">
                <input type="checkbox" className="accent-brand-green w-4 h-4" checked={!!form.nfseInformarAliquota} onChange={e => set('nfseInformarAliquota', e.target.checked)} />
                Informar a alíquota do ISS na DPS (desmarcado = a Sefin usa a alíquota parametrizada pelo município)
              </label>
              {form.nfseInformarAliquota && <Field label="Alíquota ISS (%)"><Input type="number" step="0.01" value={form.aliquota} onChange={e => set('aliquota', e.target.value)} /></Field>}
              <Field label="Descrição padrão do serviço" className="md:col-span-2"><Textarea rows={3} value={form.nfseDescricaoPadrao} onChange={e => set('nfseDescricaoPadrao', e.target.value)} /></Field>
              <Field label="Entradas do Inter: data de corte" hint={<>Recebimentos até esta data (inclusive) aparecem com a tag <b>Antes</b> em Entradas → NFS-e e não contam como pendência. Deixe vazio para tratar todos como pendentes.</>}>
                <Input type="date" value={form.entradasCorteNfse || ''} onChange={e => set('entradasCorteNfse', e.target.value)} />
              </Field>
            </div>
          </Card>
        ) : (
          <Card title="Parâmetros WebISS (ABRASF)">
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Inscrição municipal"><Input value={form.prestadorIm} onChange={e => set('prestadorIm', e.target.value)} /></Field>
              <Field label="Item LC 116"><Input value={form.itemLc116} onChange={e => set('itemLc116', e.target.value)} /></Field>
              <Field label="Alíquota (%)"><Input type="number" step="0.01" value={form.aliquota} onChange={e => set('aliquota', Number(e.target.value))} /></Field>
              <Field label="Cód. tributação municipal"><Input value={form.codigoTributacaoMunicipio} onChange={e => set('codigoTributacaoMunicipio', e.target.value)} /></Field>
              <Field label="CNAE"><Input value={form.cnae} onChange={e => set('cnae', e.target.value)} /></Field>
              <Field label="Regime especial"><Select value={form.regimeEspecialTributacao} onChange={e => set('regimeEspecialTributacao', Number(e.target.value))} options={[1, 2, 3, 4, 5, 6].map(v => ({ value: v, label: String(v) }))} /></Field>
            </div>
          </Card>
        )}
        <div><Btn variant="primary" icon={<Save size={15} />} loading={saving} onClick={salvar}>Salvar configurações fiscais</Btn></div>
      </div>

      <div className="flex flex-col gap-6">
        <Card title={<span className="flex items-center gap-2"><Shield size={16} className="text-brand-green" /> Certificado Digital A1 (e-CNPJ)</span>} subtitle="Assina a DPS e autentica (mTLS) na Sefin Nacional">
          <div className="p-5 flex flex-col gap-4">
            {certInfo ? (
              <div className="text-[12.5px] flex flex-col gap-1">
                <div>{certInfo.expired ? <Badge color="red">Expirado</Badge> : <Badge color="green">Instalado</Badge>}</div>
                <div className="text-brand-muted break-all">{certInfo.subject}</div>
                <div className="text-brand-muted">Válido até {new Date(certInfo.validTo).toLocaleDateString('pt-BR')}</div>
              </div>
            ) : <Alert type="warn">Nenhum certificado A1 instalado. Sem ele não é possível emitir NFS-e.</Alert>}
            <Field label="Arquivo .pfx / .p12"><Input type="file" accept=".pfx,.p12" onChange={e => setFile(e.target.files?.[0] || null)} /></Field>
            <Field label="Senha do certificado"><Input type="password" value={password} onChange={e => setPassword(e.target.value)} /></Field>
            <div className="flex gap-2">
              <Btn variant="primary" icon={<Upload size={15} />} loading={uploading} disabled={!file || !password} onClick={upload}>Importar certificado</Btn>
              <Btn loading={testing} onClick={testar} disabled={!certInfo}>Testar conexão</Btn>
            </div>
          </div>
        </Card>

        {nacional && (
          <Card title="Numeração e leiaute da DPS">
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Série da DPS"><Input value={form.nfseSerie} onChange={e => set('nfseSerie', e.target.value.replace(/\D/g, '').slice(0, 5))} /></Field>
              <Field label="Próximo número da DPS" hint="Avança sozinho a cada nota autorizada."><Input type="number" min="1" value={form.nfseProximoNumero} onChange={e => set('nfseProximoNumero', e.target.value)} /></Field>
              <Field label="Leiaute">
                <Select value={form.nfseLeiaute} onChange={e => set('nfseLeiaute', e.target.value)} options={[{ value: 'atual', label: 'v1.01 (produção atual)' }, { value: 'nt009', label: 'v1.01 NT 009 (produção restrita)' }]} />
              </Field>
              <Field label="Algoritmo da assinatura">
                <Select value={form.nfseAssinatura} onChange={e => set('nfseAssinatura', e.target.value)} options={[{ value: 'sha1', label: 'RSA-SHA1' }, { value: 'sha256', label: 'RSA-SHA256' }]} />
              </Field>
              <label className="md:col-span-2 flex items-center gap-2 text-[13px] cursor-pointer">
                <input type="checkbox" className="accent-brand-green w-4 h-4" checked={!!form.nfseIbsCbsAtivo} onChange={e => set('nfseIbsCbsAtivo', e.target.checked)} />
                Informar grupo IBS/CBS (Reforma Tributária) na DPS
              </label>
              {form.nfseIbsCbsAtivo && <>
                <Field label="Indicador da operação (cIndOp)"><Input value={form.nfseCIndOp} onChange={e => set('nfseCIndOp', e.target.value)} /></Field>
                <Field label="Classificação tributária (cClassTrib)"><Input value={form.nfseCClassTrib} onChange={e => set('nfseCClassTrib', e.target.value)} /></Field>
              </>}
            </div>
          </Card>
        )}

        <Card title={<span className="flex items-center gap-2"><Building2 size={16} className="text-brand-orange-dim" /> Banco Inter</span>}>
          <div className="p-5 text-[13px] text-brand-muted">As credenciais, o certificado da API e as permissões do Banco Inter ficam no menu <b className="text-brand-text">Banco Inter › Configuração</b>.</div>
        </Card>
      </div>
    </div>
  );
}
