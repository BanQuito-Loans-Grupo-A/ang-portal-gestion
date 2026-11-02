import { LowerCasePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AbstractControl, FormArray, FormBuilder, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import {
  ApiBanquito, Cargando, DatosTramo, Enfocar, EtiquetaPipe, FechaNegocioService, FechaPipe, Icono, Parametro,
  TramoCartera, mensajeDe, sumarDias,
} from 'shared';

type TipoValor = 'MONTO' | 'ENTERO' | 'PORCENTAJE' | 'FACTOR' | 'DIAS';

interface Regla {
  tipo: TipoValor;
  minimo: number;
  maximo: number | null;
  menorQue?: string;
  mayorQue?: string;
  noMayorQue?: string;
  noMenorQue?: string;
  opciones?: number[];
}

const REGLAS: Record<string, Regla> = {
  'PAR-01': { tipo: 'MONTO', minimo: 500, maximo: 30000, menorQue: 'PAR-02' },
  'PAR-02': { tipo: 'MONTO', minimo: 500, maximo: 30000, mayorQue: 'PAR-01' },
  'PAR-03': { tipo: 'ENTERO', minimo: 6, maximo: 60, menorQue: 'PAR-04' },
  'PAR-04': { tipo: 'ENTERO', minimo: 6, maximo: 60, mayorQue: 'PAR-03' },
  'PAR-05': { tipo: 'PORCENTAJE', minimo: 0.0001, maximo: 100, noMenorQue: 'PAR-06' },
  'PAR-06': { tipo: 'PORCENTAJE', minimo: 0.0001, maximo: 100, noMayorQue: 'PAR-05' },
  'PAR-07': { tipo: 'PORCENTAJE', minimo: 0.0001, maximo: 100 },
  'PAR-08': { tipo: 'PORCENTAJE', minimo: 0.0001, maximo: 100 },
  'PAR-09': { tipo: 'PORCENTAJE', minimo: 0.0001, maximo: 100 },
  'PAR-10': { tipo: 'FACTOR', minimo: 0.0001, maximo: null },
  'PAR-11': { tipo: 'DIAS', minimo: 360, maximo: 365, opciones: [360, 365] },
  'PAR-12': { tipo: 'MONTO', minimo: 0.01, maximo: null, noMayorQue: 'PAR-02' },
};

const DECIMALES: Record<TipoValor, number> = { MONTO: 2, ENTERO: 0, PORCENTAJE: 4, FACTOR: 4, DIAS: 0 };
const PASO: Record<TipoValor, number> = { MONTO: 0.01, ENTERO: 1, PORCENTAJE: 0.0001, FACTOR: 0.0001, DIAS: 1 };
const HORIZONTE = '2099-12-31';

const MONEDA = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
const NUMERO = new Intl.NumberFormat('es-EC', { maximumFractionDigits: 4 });

interface Limites {
  minimo: number;
  maximo: number | null;
  texto: string;
}

function decimalesMaximos(decimales: number): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const texto = String(control.value ?? '');
    const usados = texto.includes('.') ? texto.split('.')[1].length : 0;
    return usados > decimales ? { decimales: { permitidos: decimales } } : null;
  };
}

@Component({
  selector: 'pg-parametros',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, LowerCasePipe, Icono, Cargando, FechaPipe, EtiquetaPipe, Enfocar],
  templateUrl: './parametros.html',
  styleUrl: './parametros.css',
})
export class Parametros {
  private readonly api = inject(ApiBanquito);
  private readonly fb = inject(FormBuilder);
  protected readonly fechaNegocio = inject(FechaNegocioService);

  protected readonly parametros = signal<Parametro[]>([]);
  protected readonly programados = signal<Parametro[]>([]);
  protected readonly tramos = signal<TramoCartera[]>([]);
  protected readonly tramosProgramados = signal<TramoCartera[]>([]);
  protected readonly cargando = signal(true);
  protected readonly guardando = signal(false);
  protected readonly mensaje = signal('');
  protected readonly error = signal('');
  protected readonly errorModal = signal('');
  protected readonly editando = signal<Parametro | null>(null);
  protected readonly editandoTramos = signal(false);
  protected readonly guardado = signal(0);

  protected readonly hoy = computed(() => this.fechaNegocio.estado()?.fechaNegocio ?? '');
  protected readonly manana = computed(() => (this.hoy() ? sumarDias(this.hoy(), 1) : ''));

  protected readonly valores = computed(() => {
    const mapa = new Map<string, number>();
    for (const parametro of this.parametros()) {
      if (parametro.valorNumerico !== null) {
        mapa.set(parametro.codigo, parametro.valorNumerico);
      }
    }
    return mapa;
  });

  protected readonly programadosPorCodigo = computed(() => {
    const mapa = new Map<string, Parametro[]>();
    for (const parametro of this.programados()) {
      mapa.set(parametro.codigo, [...(mapa.get(parametro.codigo) ?? []), parametro]);
    }
    return mapa;
  });

  protected readonly formulario = this.fb.nonNullable.group({
    valor: [0, [Validators.required]],
    vigenteDesde: ['', [Validators.required]],
  });

  protected readonly formularioTramos = this.fb.nonNullable.group({
    vigenteDesde: ['', [Validators.required]],
    filas: this.fb.array<ReturnType<Parametros['filaTramo']>>([]),
  });

  constructor() {
    this.fechaNegocio.cargar();
    this.cargar();
  }

  private cargar(): void {
    this.api.parametros().subscribe({
      next: (valor) => {
        this.parametros.set(valor);
        this.cargando.set(false);
      },
      error: (fallo) => {
        this.error.set(mensajeDe(fallo, 'No fue posible cargar los parámetros'));
        this.cargando.set(false);
      },
    });
    this.api.parametrosProgramados().subscribe({
      next: (valor) => this.programados.set(valor),
      error: () => this.programados.set([]),
    });
    this.api.tramosCartera().subscribe((vigentes) => {
      this.tramos.set(vigentes);
      this.api.tramosCartera(HORIZONTE).subscribe((futuros) => {
        const cambia = futuros.length > 0 && futuros[0].vigenteDesde !== vigentes[0]?.vigenteDesde;
        this.tramosProgramados.set(cambia ? futuros : []);
      });
    });
  }

  protected editable(parametro: Parametro): boolean {
    return parametro.valorNumerico !== null && !!REGLAS[parametro.codigo];
  }

  protected tipo(codigo: string): TipoValor {
    return REGLAS[codigo]?.tipo ?? 'FACTOR';
  }

  protected formato(codigo: string, valor: number | null | undefined): string {
    if (valor === null || valor === undefined) {
      return '—';
    }
    switch (this.tipo(codigo)) {
      case 'MONTO':
        return MONEDA.format(valor);
      case 'PORCENTAJE':
        return `${NUMERO.format(valor)} %`;
      case 'ENTERO':
        return `${valor} meses`;
      case 'DIAS':
        return `${valor} días`;
      default:
        return NUMERO.format(valor);
    }
  }

  protected opciones(codigo: string): number[] | undefined {
    return REGLAS[codigo]?.opciones;
  }

  protected paso(codigo: string): number {
    return PASO[this.tipo(codigo)];
  }

  protected limites(codigo: string): Limites {
    const regla = REGLAS[codigo];
    const valores = this.valores();
    const paso = PASO[regla.tipo];
    let minimo = regla.minimo;
    let maximo = regla.maximo;
    const referencia = (otro?: string) => (otro && valores.has(otro) ? valores.get(otro)! : null);
    const mayorQue = referencia(regla.mayorQue);
    const noMenorQue = referencia(regla.noMenorQue);
    const menorQue = referencia(regla.menorQue);
    const noMayorQue = referencia(regla.noMayorQue);
    if (mayorQue !== null) {
      minimo = Math.max(minimo, this.redondear(mayorQue + paso, regla.tipo));
    }
    if (noMenorQue !== null) {
      minimo = Math.max(minimo, noMenorQue);
    }
    if (menorQue !== null) {
      const tope = this.redondear(menorQue - paso, regla.tipo);
      maximo = maximo === null ? tope : Math.min(maximo, tope);
    }
    if (noMayorQue !== null) {
      maximo = maximo === null ? noMayorQue : Math.min(maximo, noMayorQue);
    }
    const texto = regla.opciones
      ? `Valores admitidos: ${regla.opciones.join(' o ')} días`
      : maximo === null
        ? `Mínimo ${this.formato(codigo, minimo)}`
        : `Entre ${this.formato(codigo, minimo)} y ${this.formato(codigo, maximo)}`;
    return { minimo, maximo, texto };
  }

  private redondear(valor: number, tipo: TipoValor): number {
    const factor = Math.pow(10, DECIMALES[tipo]);
    return Math.round(valor * factor) / factor;
  }

  protected editar(parametro: Parametro): void {
    const { minimo, maximo } = this.limites(parametro.codigo);
    const validadores: ValidatorFn[] = [
      Validators.required,
      Validators.min(minimo),
      decimalesMaximos(DECIMALES[this.tipo(parametro.codigo)]),
    ];
    if (maximo !== null) {
      validadores.push(Validators.max(maximo));
    }
    this.formulario.controls.valor.setValidators(validadores);
    this.formulario.controls.vigenteDesde.setValidators([
      Validators.required,
      (control: AbstractControl): ValidationErrors | null =>
        this.manana() && String(control.value) < this.manana() ? { vigencia: true } : null,
    ]);
    this.formulario.reset({ valor: parametro.valorNumerico ?? 0, vigenteDesde: this.manana() });
    this.errorModal.set('');
    this.mensaje.set('');
    this.editando.set(parametro);
  }

  protected cerrar(): void {
    this.editando.set(null);
    this.errorModal.set('');
  }

  protected guardar(): void {
    const parametro = this.editando();
    if (!parametro || this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }
    const { valor, vigenteDesde } = this.formulario.getRawValue();
    this.guardando.set(true);
    this.errorModal.set('');
    this.api.actualizarParametro(parametro.codigo, { valor: Number(valor), vigenteDesde }).subscribe({
      next: (registrado) => {
        this.guardando.set(false);
        this.editando.set(null);
        this.mensaje.set(
          `${registrado.codigo} · ${registrado.nombre}: ${this.formato(registrado.codigo, registrado.valorNumerico)} desde el ${this.fechaTexto(registrado.vigenteDesde)}.`,
        );
        this.guardado.update((total) => total + 1);
        this.cargar();
      },
      error: (fallo) => {
        this.errorModal.set(mensajeDe(fallo, 'No fue posible guardar el parámetro'));
        this.guardando.set(false);
      },
    });
  }

  protected fechaTexto(fecha: string): string {
    const [anio, mes, dia] = fecha.split('-');
    return `${dia}/${mes}/${anio}`;
  }

  private filaTramo(tramo: TramoCartera) {
    return this.fb.nonNullable.group({
      numeroTramo: [tramo.numeroTramo],
      diaMoraMinimo: [
        { value: tramo.diaMoraMinimo, disabled: tramo.numeroTramo === 1 },
        [Validators.required, Validators.min(0), Validators.pattern(/^\d+$/)],
      ],
      estadoCartera: [tramo.estadoCartera],
      devengaEnResultado: [tramo.devengaEnResultado],
      acumulaMora: [tramo.acumulaMora],
      porcentajeProvision: [tramo.porcentajeProvision, [Validators.required, Validators.min(0), Validators.max(100), decimalesMaximos(2)]],
    });
  }

  protected get filas(): FormArray {
    return this.formularioTramos.controls.filas;
  }

  protected editarTramos(): void {
    const filas = this.formularioTramos.controls.filas;
    filas.clear();
    for (const tramo of this.tramos()) {
      filas.push(this.filaTramo(tramo));
    }
    this.formularioTramos.controls.vigenteDesde.setValue(this.manana());
    this.error.set('');
    this.mensaje.set('');
    this.editandoTramos.set(true);
  }

  protected cancelarTramos(): void {
    this.editandoTramos.set(false);
    this.error.set('');
  }

  protected problemaTramos(): string {
    const datos = this.datosTramos();
    for (let i = 1; i < datos.length; i++) {
      if (!(datos[i].diaMoraMinimo > datos[i - 1].diaMoraMinimo)) {
        return `El tramo ${datos[i].numeroTramo} debe empezar después del día ${datos[i - 1].diaMoraMinimo}`;
      }
      if (datos[i].porcentajeProvision < datos[i - 1].porcentajeProvision) {
        return `La provisión del tramo ${datos[i].numeroTramo} no puede ser menor que la del tramo ${datos[i - 1].numeroTramo}`;
      }
    }
    const vigencia = this.formularioTramos.controls.vigenteDesde.value;
    if (this.manana() && vigencia < this.manana()) {
      return `La tabla rige desde el siguiente cierre: la vigencia debe ser desde el ${this.fechaTexto(this.manana())}`;
    }
    return '';
  }

  private datosTramos(): DatosTramo[] {
    return this.formularioTramos.controls.filas.getRawValue().map((fila) => ({
      numeroTramo: Number(fila.numeroTramo),
      diaMoraMinimo: Number(fila.diaMoraMinimo),
      estadoCartera: fila.estadoCartera,
      devengaEnResultado: !!fila.devengaEnResultado,
      acumulaMora: !!fila.acumulaMora,
      porcentajeProvision: Number(fila.porcentajeProvision),
    }));
  }

  protected guardarTramos(): void {
    if (this.formularioTramos.invalid || this.problemaTramos()) {
      this.formularioTramos.markAllAsTouched();
      return;
    }
    const vigenteDesde = this.formularioTramos.controls.vigenteDesde.value;
    this.guardando.set(true);
    this.error.set('');
    this.api.programarTramos(this.datosTramos(), vigenteDesde).subscribe({
      next: () => {
        this.guardando.set(false);
        this.editandoTramos.set(false);
        this.mensaje.set(`Tabla de parámetros de cartera guardada. Rige desde el ${this.fechaTexto(vigenteDesde)}.`);
        this.guardado.update((total) => total + 1);
        this.cargar();
      },
      error: (fallo) => {
        this.error.set(mensajeDe(fallo, 'No fue posible guardar la tabla de tramos'));
        this.guardando.set(false);
      },
    });
  }
}
