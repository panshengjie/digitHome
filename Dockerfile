FROM ubuntu:18.04

RUN apt-get install -y curl cuetools shntool flac build-essential
RUN curl -sL https://deb.nodesource.com/setup_10.x | sudo -E bash -
RUN apt-get install -y nodejs

COPY . /src
RUN cd /src;npm i -g cnpm --registry=https://registry.npm.taobao.org; npm i

WORKDIR /home/panda/homeDigit

EXPOSE 8080
CMD ["npm", "start"]
