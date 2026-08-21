import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

let mongod = null;
let useMock = false;

// High-fidelity in-memory database store for our Mock Mongoose fallback
const dbStore = {
  User: [],
  Channel: [],
  Message: []
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const persistentStorePath = path.join(__dirname, '..', 'data', 'database.json');

const loadPersistentStore = () => {
  try {
    if (fs.existsSync(persistentStorePath)) {
      const savedStore = JSON.parse(fs.readFileSync(persistentStorePath, 'utf8'));
      Object.keys(dbStore).forEach((collection) => {
        if (Array.isArray(savedStore[collection])) {
          dbStore[collection] = savedStore[collection];
        }
      });
    }
  } catch (error) {
    console.warn(`Could not load persistent database: ${error.message}`);
  }
};

const savePersistentStore = () => {
  try {
    fs.mkdirSync(path.dirname(persistentStorePath), { recursive: true });
    const temporaryPath = `${persistentStorePath}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(dbStore, null, 2));
    fs.renameSync(temporaryPath, persistentStorePath);
  } catch (error) {
    console.error(`Could not save persistent database: ${error.message}`);
  }
};

// Mock Query Class to support chaining (.populate, .sort, .select, and await / .then)
class MockQuery {
  constructor(result, modelName) {
    this.result = result;
    this.modelName = modelName;
  }

  populate(path, selectFields) {
    if (!this.result) return this;

    const populateDoc = (doc) => {
      const cloned = { ...doc };
      
      // Populate fields on Channel
      if (this.modelName === 'Channel') {
        if (path === 'members' && Array.isArray(cloned.members)) {
          cloned.members = cloned.members.map(mId => 
            dbStore.User.find(u => u._id.toString() === mId.toString()) || mId
          );
        }
        if (path === 'createdBy' && cloned.createdBy) {
          cloned.createdBy = dbStore.User.find(u => u._id.toString() === cloned.createdBy.toString()) || cloned.createdBy;
        }
      }
      
      // Populate fields on Message
      if (this.modelName === 'Message') {
        if (path === 'sender' && cloned.sender) {
          const userObj = dbStore.User.find(u => u._id.toString() === cloned.sender.toString());
          if (userObj) {
            cloned.sender = {
              _id: userObj._id,
              username: userObj.username,
              email: userObj.email,
              avatarUrl: userObj.avatarUrl,
              status: userObj.status
            };
          }
        }
        if (path === 'readBy.user' && Array.isArray(cloned.readBy)) {
          cloned.readBy = cloned.readBy.map(r => {
            const userObj = dbStore.User.find(u => u._id.toString() === (r.user?._id || r.user).toString());
            return {
              ...r,
              user: userObj ? { _id: userObj._id, username: userObj.username, avatarUrl: userObj.avatarUrl } : r.user
            };
          });
        }
      }
      return cloned;
    };

    if (Array.isArray(this.result)) {
      this.result = this.result.map(populateDoc);
    } else {
      this.result = populateDoc(this.result);
    }
    return this;
  }

  sort(sortObj) {
    if (Array.isArray(this.result)) {
      const keys = Object.keys(sortObj);
      if (keys.length > 0) {
        const key = keys[0];
        const order = sortObj[key];
        this.result.sort((a, b) => {
          const valA = a[key];
          const valB = b[key];
          if (valA < valB) return order === -1 ? 1 : -1;
          if (valA > valB) return order === -1 ? -1 : 1;
          return 0;
        });
      }
    }
    return this;
  }

  select(fields) {
    return this;
  }

  then(onfulfilled, onrejected) {
    return Promise.resolve(this.result).then(onfulfilled, onrejected);
  }
}

// Mock Schema Class
class MockSchema {
  constructor(definition, options) {
    this.definition = definition;
    this.options = options || {};
    this.methods = {};
    this.statics = {};
    this.preHooks = {};
  }

  pre(hookName, fn) {
    if (!this.preHooks[hookName]) {
      this.preHooks[hookName] = [];
    }
    this.preHooks[hookName].push(fn);
  }
}

// Factory to create mock mongoose Models
const createMockModel = (modelName, schema) => {
  class MockModel {
    constructor(data) {
      Object.assign(this, data);
      this._id = this._id || Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
      this.createdAt = this.createdAt || new Date();
      this.updatedAt = this.updatedAt || new Date();
      
      // Bind methods defined on schema
      if (schema && schema.methods) {
        Object.keys(schema.methods).forEach(methodName => {
          this[methodName] = schema.methods[methodName].bind(this);
        });
      }
    }

    async save() {
      // Trigger pre-save hooks
      if (schema && schema.preHooks && schema.preHooks['save']) {
        for (const hook of schema.preHooks['save']) {
          await new Promise((resolve) => hook.call(this, resolve));
        }
      }

      this.updatedAt = new Date();
      const existingIdx = dbStore[modelName].findIndex(d => d._id.toString() === this._id.toString());
      
      const doc = {};
      Object.keys(this).forEach(k => {
        if (typeof this[k] === 'function') return;
        doc[k] = this[k];
      });

      if (existingIdx >= 0) {
        dbStore[modelName][existingIdx] = doc;
      } else {
        dbStore[modelName].push(doc);
      }
      savePersistentStore();
      return this;
    }

    // Static queries
    static async create(data) {
      const doc = new MockModel(data);
      await doc.save();
      return doc;
    }

    static find(filter) {
      let list = [...dbStore[modelName]];
      
      if (filter) {
        list = list.filter(item => {
          return Object.keys(filter).every(key => {
            const filterVal = filter[key];

            if (key === '$or' && Array.isArray(filterVal)) {
              return filterVal.some(subFilter => {
                return Object.keys(subFilter).every(subKey => {
                  return item[subKey] === subFilter[subKey];
                });
              });
            }

            if (filterVal && typeof filterVal === 'object' && filterVal.$in) {
              const array = filterVal.$in.map(val => val.toString());
              const val = item[key];
              if (Array.isArray(val)) {
                return val.some(v => array.includes(v.toString()));
              }
              return array.includes(val?.toString());
            }

            if (filterVal && typeof filterVal === 'object' && filterVal.$all) {
              const requiredValues = filterVal.$all.map(value => value.toString());
              const values = Array.isArray(item[key]) ? item[key].map(value => value.toString()) : [];
              return requiredValues.every(value => values.includes(value));
            }

            if (filterVal && typeof filterVal === 'object' && filterVal.$size !== undefined) {
              return Array.isArray(item[key]) && item[key].length === filterVal.$size;
            }

            if (filterVal && typeof filterVal === 'object' && filterVal.$ne) {
              return item[key]?.toString() !== filterVal.$ne.toString();
            }

            if (filterVal && typeof filterVal === 'object' && filterVal.$regex) {
              const query = filterVal.$regex;
              const options = filterVal.$options || '';
              const regex = new RegExp(query, options);
              return regex.test(item[key]);
            }

            if (item[key] && filterVal) {
              return item[key].toString() === filterVal.toString();
            }
            return item[key] === filterVal;
          });
        });
      }

      const instances = list.map(item => new MockModel(item));
      return new MockQuery(instances, modelName);
    }

    static findOne(filter) {
      const query = MockModel.find(filter);
      const res = query.result.length > 0 ? query.result[0] : null;
      return new MockQuery(res, modelName);
    }

    static findById(id) {
      if (!id) return new MockQuery(null, modelName);
      const res = dbStore[modelName].find(item => item._id.toString() === id.toString());
      const instance = res ? new MockModel(res) : null;
      return new MockQuery(instance, modelName);
    }

    static async findByIdAndUpdate(id, update, options) {
      const doc = dbStore[modelName].find(item => item._id.toString() === id.toString());
      if (doc) {
        Object.assign(doc, update);
        doc.updatedAt = new Date();
        return new MockModel(doc);
      }
      return null;
    }
  }

  return MockModel;
};

// Database connection startup
export const connectDB = async () => {
  if (process.env.USE_MOCK === 'true' || (process.env.VERCEL && !process.env.MONGODB_URI)) {
    console.log('========================================================================');
    console.log(' [DIRECT] ACTIVATING HIGH-FIDELITY IN-MEMORY MOCK DATABASE ADAPTER ');
    console.log('========================================================================');
    loadPersistentStore();
    useMock = true;
    return null;
  }

  let dbUrl = process.env.MONGODB_URI;

  if (dbUrl) {
    try {
      console.log('Connecting to external MongoDB URL...');
      const conn = await mongoose.connect(dbUrl);
      console.log(`MongoDB Connected: ${conn.connection.host}`);
      return conn;
    } catch (error) {
      console.error(`External MongoDB connection failed: ${error.message}`);
      console.log('Falling back to local in-memory DB...');
    }
  }

  // Attempt to spin up MongoMemoryServer
  try {
    console.log('Spinning up MongoMemoryServer...');
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    console.log(`MongoMemoryServer started at: ${uri}`);
    
    const conn = await mongoose.connect(uri);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.warn(`MongoMemoryServer failed to start: ${error.message}`);
    console.log('Exit Code is large, commonly meaning that vc_redist is not installed.');
    console.log('========================================================================');
    console.log(' [FALLBACK] ACTIVATING HIGH-FIDELITY IN-MEMORY MOCK DATABASE ADAPTER ');
    console.log(' This enables full application functionality without MongoDB or VC++ Runtimes.');
    console.log('========================================================================');
    loadPersistentStore();
    useMock = true;
    return null;
  }
};

export const closeDB = async () => {
  if (useMock) return;
  try {
    await mongoose.connection.close();
    if (mongod) {
      await mongod.stop();
    }
  } catch (error) {
    console.error(`Error closing database: ${error.message}`);
  }
};

// Dynamic Mongoose model factory that selects real Mongoose vs Mock Mongoose query handling dynamically at runtime
const modelCache = {};
const getDynamicModel = (modelName, schema) => {
  if (modelCache[modelName]) {
    return modelCache[modelName];
  }

  // Create BOTH models (mongoose will register schema synchronously)
  const realMongooseModel = mongoose.model(modelName, schema);
  const mockMongooseModel = createMockModel(modelName, schema);

  // Return a Proxy class that intercepts all constructor instantiations and static queries at runtime
  const dynamicModelProxy = new Proxy(realMongooseModel, {
    get: (target, prop) => {
      if (useMock) {
        return mockMongooseModel[prop];
      }
      return target[prop];
    },
    construct: (target, args) => {
      if (useMock) {
        return new mockMongooseModel(...args);
      }
      return new target(...args);
    }
  });

  modelCache[modelName] = dynamicModelProxy;
  return dynamicModelProxy;
};

// Exporting a custom transparent DB engine wrapper
const mockMongoose = {
  Schema: MockSchema,
  model: (name, schema) => {
    return getDynamicModel(name, schema);
  },
  SchemaTypes: {
    ObjectId: 'ObjectId'
  }
};

mockMongoose.Schema.Types = {
  ObjectId: 'ObjectId'
};

const dbInstance = new Proxy(mongoose, {
  get: (target, prop) => {
    if (prop === 'model') {
      return (name, schema) => getDynamicModel(name, schema);
    }
    if (useMock) {
      return mockMongoose[prop] !== undefined ? mockMongoose[prop] : target[prop];
    }
    return target[prop];
  }
});

export default dbInstance;
export { useMock };
