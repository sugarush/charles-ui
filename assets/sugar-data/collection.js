import WebToken from './webtoken.js';
import { Model } from './model.js';
import { urlencode } from './urlencode.js';
import { jsonapi } from './request.js';


export class Collection {

  constructor(options={ }) {
    if(!options.host) {
      throw Error('Collection missing constructor parameter: host');
    }

    if(!options.uri) {
      throw Error('Collection missing constructor parameter: uri');
    }

    if(!options.type) {
      throw Error('Collection missing constructor parameter: type');
    }

    this.socket = null;

    this._host = _.trim(options.host, '/');
    this._uri = _.trim(options.uri, '/');
    this._type = _.trim(options.type, '/');

    this.index = { };
    this.models = [ ];
    this.offset = 0;
    this.limit = 0;
    this.total = 0;
    this.errors = [ ];

    if(options.realtime) {
      const uri = `ws://${_.replace(this._host, 'http://', '')}/${this._uri}/${this._type}/realtime`;

      this.socket = new WebSocket(uri);

      this.socket.addEventListener("message", async (event) => {

        let json = null;

        try {
          json = JSON.parse(event.data);
        } catch {
          throw Error(`Could not parse JSON data: ${event.data}`);
        }

        switch(json.action) {
          case "create":
            if(this.inclusive) {
              this.add_by_id(json.id);
            }
            break;
          case "update":
            if(json.id in this.index) {
              await this.index[json.id].load();
            }
            break;
          case "delete":
            if(json.id in this.index) {
              model = this.index[json.id];
              model.unsubscribe(this.socket);
              delete this.index[json.id];
              this.models = _.reject(this.models, (_model) => {
                return _model.id === model.id;
              });
            }
            break;
        }

      });
    }
  }

  get uri() {
    return `${this._host}/${this._uri}/${this._type}`;
  }

  get errored() {
    return this.errors.length;
  }

  add(model) {
    this.index[model.id] = model;
    this.models.push(model);

    if(this.socket) {
      model.subscribe(this.socket);
    }
  }

  remove(model) {
    if(this.socket) {
      model.unsubscribe(this.socket);
    }

    delete this.index[model.id];

    this.models = _.reject(this.models, function(_model) {
      return model.id == _model.id;
    });
  }

  async add_by_id(id) {
    if(!id) {
      throw Error('Collection.add_by_id: No ID provided.')
    }

    const model = new Model({
      host: this._host,
      uri: this.uri,
      type: this._type,
      id: id
    });

    await this.model.load();

    this.add(model);

    return this.index[id];
  }

  async remove_by_id(id) {
    if(!id) {
      throw Error('Collection.remove_by_id: No ID provided.')
    }

    if(!(id in this.index)) {
      throw Error('Collection.remove_by_id: ID not found in index.')
    }

    model = this.index[id];

    this.remove(model);
  }

  parse(json) {
    for(let model of this.models) {
      if(this.socket) {
        model.unsubscribe(this.socket);
      }
    }

    this.errors = [ ];
    this.index = { };
    this.models = [ ];
    this.offset = 0;
    this.limit = 0;
    this.total = 0;

    if(json.errors) {

      this.errors = json.errors;

    }

    _.forEach(json.data, (item) => {
      let model = new Model({
        host: this._host,
        type: this._type,
        uri: this._uri,
        id: item.id,
        attributes: item.attributes
      });

      this.add(model);

    });

    if(json.meta) {
      this.offset = json.meta.offset;
      this.limit = json.meta.limit;
      this.total = json.meta.total;
    }

  }

  async find(options) {
    if(options) {

      if(options.query) {
        options.query = JSON.stringify(options.query);
      }

      if(options.fields) {
        options.fields = JSON.stringify(options.fields);
      }

      if(options.sort) {
        options.sort = options.sort.join(',');
      }

      if(options.page) {

        if(options.page.offset) {
          options['page[offset]'] = options.page.offset;
          delete options.page['offset'];
        }

        if(options.page.limit) {
          options['page[limit]'] = options.page.limit;
          delete options.page['limit'];
        }

        delete options['page'];

      }
    }

    let json = await jsonapi(this.uri, {
      method: 'GET',
      params: options
    });

    this.parse(json);

    return this;
  }

  clear() {
    this.parse({ data: [ ] });
  }
}
