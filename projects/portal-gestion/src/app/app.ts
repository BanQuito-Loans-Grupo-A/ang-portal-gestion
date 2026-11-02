import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { EnlaceNavegacion, FechaNegocioService, Marco } from 'shared';

@Component({
  selector: 'pg-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Marco],
  template: `<bq-marco area="Portal de Gestión" inicio="/bandeja" [enlaces]="enlaces" />`,
})
export class App {
  private readonly fechaNegocio = inject(FechaNegocioService);

  protected readonly enlaces: EnlaceNavegacion[] = [
    { ruta: '/bandeja', texto: 'Bandeja', icono: 'documento' },
    { ruta: '/operaciones', texto: 'Operaciones', icono: 'cartera' },
    { ruta: '/cierre', texto: 'Cierre de día', icono: 'rayo' },
    { ruta: '/reportes', texto: 'Reportes', icono: 'grafico' },
    { ruta: '/parametros', texto: 'Parámetros', icono: 'engranaje' },
  ];

  constructor() {
    this.fechaNegocio.cargar();
  }
}
